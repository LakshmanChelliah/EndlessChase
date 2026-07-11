using EndlessChase.Level;
using EndlessChase.Meta;
using EndlessChase.Player;
using EndlessChase.Traffic;
using EndlessChase.UI;
using UnityEngine;

namespace EndlessChase.Core
{
    /// <summary>
    /// Wires runtime references and ensures SaveService exists before play.
    /// </summary>
    public sealed class GameBootstrap : MonoBehaviour
    {
        [SerializeField] SaveService _save;
        [SerializeField] UpgradeManager _upgrades;
        [SerializeField] LanePlayerController _player;
        [SerializeField] LevelManager _level;
        [SerializeField] TrafficSpawner _traffic;
        [SerializeField] GameUIController _ui;

        void Awake()
        {
            Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 0;

            if (SaveService.Instance == null && _save == null)
            {
                var go = new GameObject("SaveService");
                _save = go.AddComponent<SaveService>();
            }
        }
    }
}
