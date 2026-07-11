using EndlessChase.Level;
using EndlessChase.Meta;
using EndlessChase.Player;
using EndlessChase.Traffic;
using UnityEngine;

namespace EndlessChase.UI
{
    /// <summary>
    /// Minimal UI flow: Menu → Run HUD → Game Over / Upgrades.
    /// </summary>
    public sealed class GameUIController : MonoBehaviour
    {
        [SerializeField] GameObject _menuPanel;
        [SerializeField] GameObject _hudPanel;
        [SerializeField] GameObject _gameOverPanel;
        [SerializeField] GameObject _upgradesPanel;
        [SerializeField] HUDView _hud;
        [SerializeField] UpgradePanel _upgrades;
        [SerializeField] LanePlayerController _player;
        [SerializeField] LevelManager _level;
        [SerializeField] TrafficSpawner _traffic;
        [SerializeField] UpgradeManager _upgradeManager;

        int _runCoins;
        float _runScore;

        void OnEnable()
        {
            if (_player != null)
            {
                _player.OnCrashed += HandleCrash;
                _player.OnCoinCollected += HandleCoin;
            }
        }

        void OnDisable()
        {
            if (_player != null)
            {
                _player.OnCrashed -= HandleCrash;
                _player.OnCoinCollected -= HandleCoin;
            }
        }

        void Start()
        {
            ShowMenu();
        }

        void Update()
        {
            if (_hudPanel != null && _hudPanel.activeSelf && _player != null && _player.IsAlive)
            {
                _runScore = _player.DistanceTravelled;
                if (_hud != null)
                    _hud.SetRunStats(_runScore, _runCoins + (_upgradeManager != null ? 0 : 0), _player.IsBoosting);
            }
        }

        public void ShowMenu()
        {
            SetPanels(menu: true, hud: false, gameOver: false, upgrades: false);
            _level?.StopLevel();
            _traffic?.StopSpawning();
            _player?.StopRun();
        }

        public void OnPlayClicked()
        {
            _runCoins = 0;
            _runScore = 0f;
            SetPanels(menu: false, hud: true, gameOver: false, upgrades: false);
            _level?.StartLevel();
            _traffic?.StartSpawning();
            _player?.StartRun();
            if (_hud != null)
                _hud.SetRunStats(0f, TotalCoinsDisplay(), false);
        }

        public void OnRetryClicked() => OnPlayClicked();

        public void OnUpgradesClicked()
        {
            SetPanels(menu: false, hud: false, gameOver: false, upgrades: true);
            _upgrades?.Refresh(_upgradeManager);
        }

        public void OnBackFromUpgrades()
        {
            if (_gameOverPanel != null && _player != null && !_player.IsAlive)
                SetPanels(menu: false, hud: false, gameOver: true, upgrades: false);
            else
                ShowMenu();
        }

        void HandleCoin(int amount)
        {
            _runCoins += amount;
            _upgradeManager?.AddCoins(amount);
            _hud?.SetRunStats(_runScore, TotalCoinsDisplay(), _player != null && _player.IsBoosting);
        }

        void HandleCrash()
        {
            _level?.StopLevel();
            _traffic?.StopSpawning();
            SetPanels(menu: false, hud: false, gameOver: true, upgrades: false);
            if (_hud != null)
                _hud.SetGameOver(_runScore, _runCoins);
        }

        int TotalCoinsDisplay()
        {
            return _upgradeManager != null ? _upgradeManager.Coins : _runCoins;
        }

        void SetPanels(bool menu, bool hud, bool gameOver, bool upgrades)
        {
            if (_menuPanel) _menuPanel.SetActive(menu);
            if (_hudPanel) _hudPanel.SetActive(hud);
            if (_gameOverPanel) _gameOverPanel.SetActive(gameOver);
            if (_upgradesPanel) _upgradesPanel.SetActive(upgrades);
        }
    }
}
