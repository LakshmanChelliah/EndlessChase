using UnityEngine;

namespace EndlessChase.Meta
{
    /// <summary>
    /// Tracks currency and upgrade levels. Stats feed LanePlayerController.
    /// Persist via SaveService (WebGL IndexedDB-safe PlayerPrefs).
    /// </summary>
    public sealed class UpgradeManager : MonoBehaviour
    {
        public const int MaxLevel = 5;

        [SerializeField] int[] _upgradeCosts = { 50, 100, 200, 400, 800 };
        [SerializeField] float _topSpeedPerLevel = 0.08f;
        [SerializeField] float _accelPerLevel = 0.1f;
        [SerializeField] float _handlingPerLevel = 0.1f;

        SaveService _save;

        public int Coins => _save != null ? _save.Data.coins : 0;
        public int TopSpeedLevel => _save != null ? _save.Data.topSpeedLevel : 0;
        public int AccelerationLevel => _save != null ? _save.Data.accelerationLevel : 0;
        public int HandlingLevel => _save != null ? _save.Data.handlingLevel : 0;

        public float TopSpeedFactor => 1f + TopSpeedLevel * _topSpeedPerLevel;
        public float AccelerationFactor => 1f + AccelerationLevel * _accelPerLevel;
        public float HandlingFactor => 1f + HandlingLevel * _handlingPerLevel;

        public System.Action OnChanged;

        void Awake()
        {
            _save = SaveService.Instance;
            if (_save == null)
            {
                var go = new GameObject("SaveService");
                _save = go.AddComponent<SaveService>();
            }
        }

        public void AddCoins(int amount)
        {
            if (amount == 0 || _save == null) return;
            _save.Data.coins = Mathf.Max(0, _save.Data.coins + amount);
            _save.Save();
            OnChanged?.Invoke();
        }

        public int CostForNext(int currentLevel)
        {
            if (currentLevel >= MaxLevel) return -1;
            int idx = Mathf.Clamp(currentLevel, 0, _upgradeCosts.Length - 1);
            return _upgradeCosts[idx];
        }

        public bool TryUpgradeTopSpeed() => TryUpgrade(ref _save.Data.topSpeedLevel);
        public bool TryUpgradeAcceleration() => TryUpgrade(ref _save.Data.accelerationLevel);
        public bool TryUpgradeHandling() => TryUpgrade(ref _save.Data.handlingLevel);

        bool TryUpgrade(ref int level)
        {
            if (_save == null || level >= MaxLevel) return false;
            int cost = CostForNext(level);
            if (cost < 0 || _save.Data.coins < cost) return false;

            _save.Data.coins -= cost;
            level++;
            _save.Save();
            OnChanged?.Invoke();
            return true;
        }
    }
}
