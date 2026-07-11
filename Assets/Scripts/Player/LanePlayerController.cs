using EndlessChase.Input;
using EndlessChase.Meta;
using UnityEngine;

namespace EndlessChase.Player
{
    /// <summary>
    /// 3-lane endless-runner controller. Lateral motion via SmoothDamp toward lane X.
    /// Forward speed driven by UpgradeManager stats + temporary boost multipliers.
    /// </summary>
    public sealed class LanePlayerController : MonoBehaviour
    {
        public const int LaneCount = 3;
        public static readonly float[] LaneXs = { -3.2f, 0f, 3.2f };

        [Header("Motion")]
        [SerializeField] float _baseSpeed = 18f;
        [SerializeField] float _laneSmoothTime = 0.12f;
        [SerializeField] float _jumpHeight = 2.2f;
        [SerializeField] float _jumpDuration = 0.55f;
        [SerializeField] float _slideDuration = 0.5f;

        [Header("Refs")]
        [SerializeField] WebSafeTouchInput _input;
        [SerializeField] UpgradeManager _upgrades;
        [SerializeField] Collider _bodyCollider;

        public int LaneIndex { get; private set; } = 1;
        public float ForwardSpeed { get; private set; }
        public float DistanceTravelled { get; private set; }
        public bool IsAlive { get; private set; } = true;
        public bool IsBoosting => _boostTimer > 0f;
        public float BoostMultiplier => _boostMultiplier;

        float _laneVelocity;
        float _boostTimer;
        float _boostMultiplier = 1f;
        float _jumpTimer;
        float _slideTimer;
        float _groundY;
        bool _running;

        public System.Action OnCrashed;
        public System.Action<int> OnCoinCollected;

        void Awake()
        {
            _groundY = transform.position.y;
            Application.targetFrameRate = 60;
        }

        void OnEnable()
        {
            if (_input != null)
                _input.OnSwipe += HandleSwipe;
        }

        void OnDisable()
        {
            if (_input != null)
                _input.OnSwipe -= HandleSwipe;
        }

        public void StartRun()
        {
            IsAlive = true;
            _running = true;
            LaneIndex = 1;
            DistanceTravelled = 0f;
            _boostTimer = 0f;
            _boostMultiplier = 1f;
            _jumpTimer = 0f;
            _slideTimer = 0f;

            var p = transform.position;
            p.x = LaneXs[LaneIndex];
            p.y = _groundY;
            transform.position = p;
        }

        public void StopRun()
        {
            _running = false;
        }

        void HandleSwipe(SwipeDirection dir)
        {
            if (!_running || !IsAlive) return;

            switch (dir)
            {
                case SwipeDirection.Left:
                    SetLane(LaneIndex - 1);
                    break;
                case SwipeDirection.Right:
                    SetLane(LaneIndex + 1);
                    break;
                case SwipeDirection.Up:
                    TryJump();
                    break;
                case SwipeDirection.Down:
                    TrySlide();
                    break;
            }
        }

        void SetLane(int index)
        {
            float handling = _upgrades != null ? _upgrades.HandlingFactor : 1f;
            // Higher handling = snappier lane change (shorter smooth time floor)
            _laneSmoothTime = Mathf.Lerp(0.18f, 0.08f, Mathf.Clamp01((handling - 1f) / 0.5f));
            LaneIndex = Mathf.Clamp(index, 0, LaneCount - 1);
        }

        void TryJump()
        {
            if (_jumpTimer > 0f || _slideTimer > 0f) return;
            _jumpTimer = _jumpDuration;
        }

        void TrySlide()
        {
            if (_slideTimer > 0f || _jumpTimer > 0f) return;
            _slideTimer = _slideDuration;
        }

        /// <summary>Called by traffic-light risk/reward when running a red.</summary>
        public void ApplySpeedBoost(float multiplier, float duration)
        {
            _boostMultiplier = Mathf.Max(multiplier, _boostMultiplier);
            _boostTimer = Mathf.Max(_boostTimer, duration);
        }

        void Update()
        {
            if (!_running || !IsAlive) return;

            float topSpeedMul = _upgrades != null ? _upgrades.TopSpeedFactor : 1f;
            float accelMul = _upgrades != null ? _upgrades.AccelerationFactor : 1f;

            float targetSpeed = _baseSpeed * topSpeedMul;
            if (_boostTimer > 0f)
            {
                targetSpeed *= _boostMultiplier;
                _boostTimer -= Time.deltaTime;
                if (_boostTimer <= 0f)
                {
                    _boostTimer = 0f;
                    _boostMultiplier = 1f;
                }
            }

            ForwardSpeed = Mathf.MoveTowards(ForwardSpeed, targetSpeed, (8f * accelMul) * Time.deltaTime);
            float dz = ForwardSpeed * Time.deltaTime;
            DistanceTravelled += dz;

            Vector3 pos = transform.position;
            pos.z += dz;

            float targetX = LaneXs[LaneIndex];
            pos.x = Mathf.SmoothDamp(pos.x, targetX, ref _laneVelocity, _laneSmoothTime);

            if (_jumpTimer > 0f)
            {
                _jumpTimer -= Time.deltaTime;
                float t = 1f - Mathf.Clamp01(_jumpTimer / _jumpDuration);
                pos.y = _groundY + Mathf.Sin(t * Mathf.PI) * _jumpHeight;
            }
            else if (_slideTimer > 0f)
            {
                _slideTimer -= Time.deltaTime;
                pos.y = _groundY;
            }
            else
            {
                pos.y = _groundY;
            }

            transform.position = pos;
        }

        void OnTriggerEnter(Collider other)
        {
            if (!IsAlive || !_running) return;

            if (other.CompareTag("Traffic") || other.CompareTag("Hazard"))
            {
                // Jump clears low hazards if tagged HazardLow
                if (other.CompareTag("Hazard") && _jumpTimer > 0f) return;
                Crash();
            }
            else if (other.CompareTag("Coin"))
            {
                OnCoinCollected?.Invoke(1);
                var pooled = other.GetComponent<Pooling.PooledObject>();
                if (pooled != null) pooled.ReturnToPool();
                else other.gameObject.SetActive(false);
            }
        }

        public void Crash()
        {
            if (!IsAlive) return;
            IsAlive = false;
            _running = false;
            ForwardSpeed = 0f;
            OnCrashed?.Invoke();
        }
    }
}
