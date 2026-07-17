using EndlessChase.Meta;
using EndlessChase.Player;
using UnityEngine;
using UnityEngine.Events;

namespace EndlessChase.RiskReward
{
    /// <summary>
    /// Mid-run ATM opportunity: after a random distance threshold above 300m,
    /// fires <see cref="OnMidRunOpportunity"/> (cooldown prevents overlap).
    /// Choice UI pauses lane switching while the world keeps scrolling;
    /// Smash ATM → quick puzzle; success awards coins + speed boost,
    /// fail halves <see cref="PoliceDistance"/> so cops sit on the player's tail.
    /// </summary>
    public sealed class MidRunOpportunity : MonoBehaviour
    {
        public const string EventName = "OnMidRunOpportunity";

        [Header("Distance gate")]
        [SerializeField] float _minDistance = 300f;
        [SerializeField] float _thresholdSpread = 220f;
        [SerializeField] float _cooldownMeters = 450f;

        [Header("Choice / puzzle")]
        [SerializeField] float _choiceSeconds = 3f;
        [SerializeField] float _puzzleSeconds = 4f;
        [SerializeField] int _puzzleSteps = 3;

        [Header("Rewards / fail")]
        [SerializeField] int _bonusCoins = 500;
        [SerializeField] float _speedBoostMul = 1.45f;
        [SerializeField] float _speedBoostDuration = 3.25f;
        [SerializeField] float _policeDistanceStart = 100f;

        [Header("Refs")]
        [SerializeField] LanePlayerController _player;
        [SerializeField] UpgradeManager _upgrades;

        [Header("Events")]
        public UnityEvent OnMidRunOpportunity;
        public UnityEvent OnCrimeSuccess;
        public UnityEvent OnCrimeFail;

        public float PoliceDistance { get; private set; }
        public bool LaneSwitchLocked => _phase != Phase.Idle;
        public Phase CurrentPhase => _phase;

        public enum Phase
        {
            Idle,
            Choice,
            Puzzle
        }

        Phase _phase = Phase.Idle;
        float _nextThreshold;
        float _lastTriggerDistance = float.NegativeInfinity;
        float _timer;
        int _pinIndex;
        int[] _pin;

        void Awake()
        {
            if (_player == null)
                _player = FindObjectOfType<LanePlayerController>();
            ResetRun();
        }

        public void ResetRun()
        {
            PoliceDistance = _policeDistanceStart;
            _phase = Phase.Idle;
            _lastTriggerDistance = float.NegativeInfinity;
            _nextThreshold = RollThreshold(_minDistance);
            _timer = 0f;
            _pin = null;
            _pinIndex = 0;
        }

        void Update()
        {
            if (_player == null || !_player.IsAlive) return;

            if (_phase == Phase.Idle)
            {
                TickDistanceGate(_player.DistanceTravelled);
                return;
            }

            // World keeps moving via LanePlayerController; we only own the timers.
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;

            if (_phase == Phase.Choice)
                IgnoreOpportunity();
            else if (_phase == Phase.Puzzle)
                CompleteCrime(success: false);
        }

        void TickDistanceGate(float distance)
        {
            if (distance < _nextThreshold) return;
            if (!float.IsNegativeInfinity(_lastTriggerDistance) &&
                distance - _lastTriggerDistance < _cooldownMeters)
            {
                _nextThreshold = _lastTriggerDistance + _cooldownMeters;
                return;
            }

            _lastTriggerDistance = distance;
            _nextThreshold = RollThreshold(distance + _cooldownMeters);
            BeginChoice();
            OnMidRunOpportunity?.Invoke();
        }

        float RollThreshold(float minFloor)
        {
            float floor = Mathf.Max(_minDistance, minFloor);
            return floor + Random.Range(0f, _thresholdSpread);
        }

        void BeginChoice()
        {
            _phase = Phase.Choice;
            _timer = _choiceSeconds;
            // Lane lock is exposed via LaneSwitchLocked — player controller should query it.
        }

        public void SmashAtm()
        {
            if (_phase != Phase.Choice) return;
            _phase = Phase.Puzzle;
            _timer = _puzzleSeconds;
            _pinIndex = 0;
            _pin = new int[_puzzleSteps];
            for (int i = 0; i < _puzzleSteps; i++)
                _pin[i] = Random.Range(0, 3);
        }

        public void IgnoreOpportunity()
        {
            if (_phase != Phase.Choice) return;
            EndOpportunity();
        }

        /// <summary>Feed pad index 0=L, 1=C, 2=R for the quick PIN puzzle.</summary>
        public void SubmitPad(int pad)
        {
            if (_phase != Phase.Puzzle || _pin == null) return;
            if (pad != _pin[_pinIndex])
            {
                CompleteCrime(success: false);
                return;
            }

            _pinIndex++;
            if (_pinIndex >= _pin.Length)
                CompleteCrime(success: true);
        }

        /// <summary>
        /// Mid-run crime resolve: fail halves policeDistance; success grants coins + Speed Boost.
        /// </summary>
        public void CompleteCrime(bool success)
        {
            if (_phase == Phase.Idle) return;

            if (success)
            {
                if (_upgrades != null)
                    _upgrades.AddCoins(_bonusCoins);
                if (_player != null)
                    _player.ApplySpeedBoost(_speedBoostMul, _speedBoostDuration);
                OnCrimeSuccess?.Invoke();
            }
            else
            {
                PoliceDistance = Mathf.Max(1f, PoliceDistance * 0.5f);
                OnCrimeFail?.Invoke();
            }

            EndOpportunity();
        }

        void EndOpportunity()
        {
            _phase = Phase.Idle;
            _timer = 0f;
            _pin = null;
            _pinIndex = 0;
        }
    }
}
