using EndlessChase.Player;
using EndlessChase.Traffic;
using UnityEngine;

namespace EndlessChase.RiskReward
{
    /// <summary>
    /// Intersection risk/reward: running a red grants a speed boost but spawns cross traffic.
    /// </summary>
    public sealed class IntersectionSegment : MonoBehaviour
    {
        [SerializeField] TrafficLightController _light;
        [SerializeField] TrafficSpawner _traffic;
        [SerializeField] float _boostMultiplier = 1.35f;
        [SerializeField] float _boostDuration = 2.5f;
        [SerializeField] float _triggerRadius = 4f;
        [SerializeField] Transform _crossSpawn;

        bool _resolved;
        LanePlayerController _player;

        void OnEnable()
        {
            _resolved = false;
        }

        void Update()
        {
            if (_resolved || _light == null || !_light.IsActive) return;
            if (_player == null)
                _player = FindObjectOfType<LanePlayerController>();
            if (_player == null || !_player.IsAlive) return;

            float dz = Mathf.Abs(_player.transform.position.z - transform.position.z);
            if (dz > _triggerRadius) return;

            _resolved = true;

            if (_light.State == LightState.Red)
            {
                _player.ApplySpeedBoost(_boostMultiplier, _boostDuration);
                if (_traffic != null)
                {
                    Vector3 origin = _crossSpawn != null
                        ? _crossSpawn.position
                        : transform.position + new Vector3(-10f, 0.5f, 0f);
                    _traffic.SpawnCrossTraffic(origin);
                }
            }
            // Green/Yellow: safe passage, no boost
        }
    }
}
