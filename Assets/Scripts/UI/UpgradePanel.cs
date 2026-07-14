using EndlessChase.Meta;
using UnityEngine;
using UnityEngine.UI;

namespace EndlessChase.UI
{
    /// <summary>
    /// Garage UI — binds coin balance and top-speed / accel / handling upgrade rows
    /// to <see cref="UpgradeManager"/> purchase attempts.
    /// </summary>
    public sealed class UpgradePanel : MonoBehaviour
    {
        [SerializeField] Text _coinsText;
        [SerializeField] Text _topSpeedText;
        [SerializeField] Text _accelText;
        [SerializeField] Text _handlingText;
        [SerializeField] Button _topSpeedButton;
        [SerializeField] Button _accelButton;
        [SerializeField] Button _handlingButton;

        UpgradeManager _upgrades;

        public void Refresh(UpgradeManager upgrades)
        {
            _upgrades = upgrades;
            if (_upgrades == null) return;

            if (_coinsText) _coinsText.text = $"Coins: {_upgrades.Coins}";
            BindStat(_topSpeedText, _topSpeedButton, "Top Speed", _upgrades.TopSpeedLevel, () => _upgrades.TryUpgradeTopSpeed());
            BindStat(_accelText, _accelButton, "Acceleration", _upgrades.AccelerationLevel, () => _upgrades.TryUpgradeAcceleration());
            BindStat(_handlingText, _handlingButton, "Handling", _upgrades.HandlingLevel, () => _upgrades.TryUpgradeHandling());
        }

        void BindStat(Text label, Button button, string name, int level, System.Func<bool> tryUpgrade)
        {
            int cost = _upgrades.CostForNext(level);
            string costLabel = level >= UpgradeManager.MaxLevel ? "MAX" : $"{cost}";
            if (label) label.text = $"{name} Lv {level}/{UpgradeManager.MaxLevel}  ({costLabel})";

            if (button == null) return;
            button.onClick.RemoveAllListeners();
            button.interactable = level < UpgradeManager.MaxLevel && cost >= 0 && _upgrades.Coins >= cost;
            button.onClick.AddListener(() =>
            {
                if (tryUpgrade())
                    Refresh(_upgrades);
            });
        }
    }
}
