using EndlessChase.Level;
using EndlessChase.Player;
using EndlessChase.Pooling;
using UnityEngine;

namespace EndlessChase.Traffic
{
    /// <summary>
    /// Spawns pooled civilian / police / cross-traffic based on biome density.
    /// </summary>
    public sealed class TrafficSpawner : MonoBehaviour
    {
        [SerializeField] ObjectPool _pool;
        [SerializeField] LevelManager _level;
        [SerializeField] LanePlayerController _player;
        [SerializeField] string[] _civilianPoolIds = { "car_civ_sedan", "car_civ_hatch", "car_civ_van" };
        [SerializeField] string _policePoolId = "car_police";
        [SerializeField] string _crossPoolId = "car_cross";
        [SerializeField] float _spawnInterval = 1.1f;
        [SerializeField] float _policeChance = 0f; // Random road police disabled — only scripted chase cops

        float _timer;
        bool _running;

        public void StartSpawning()
        {
            _running = true;
            _timer = 0.5f;
        }

        public void StopSpawning()
        {
            _running = false;
        }

        void Update()
        {
            if (!_running || _player == null || !_player.IsAlive) return;

            _timer -= Time.deltaTime;
            if (_timer > 0f) return;

            float density = 0.35f;
            // Density scales mildly with distance
            density = Mathf.Clamp01(0.25f + _player.DistanceTravelled / 2000f);
            _timer = Mathf.Lerp(1.4f, 0.65f, density);

            SpawnForwardTraffic();
        }

        void SpawnForwardTraffic()
        {
            if (_civilianPoolIds == null || _civilianPoolIds.Length == 0) return;

            int lane = Random.Range(0, LanePlayerController.LaneCount);
            // Avoid spawning directly on player lane too often
            if (lane == _player.LaneIndex && Random.value < 0.4f)
                lane = (lane + 1) % LanePlayerController.LaneCount;

            // Civilian-only forward traffic — chase/pursuit cops are spawned separately.
            string id = _civilianPoolIds[Random.Range(0, _civilianPoolIds.Length)];

            float z = _player.transform.position.z + Random.Range(35f, 70f);
            float x = LanePlayerController.LaneXs[lane];

            // Keep spacing from other active traffic in the same lane
            const float minGap = 10f;
            foreach (var other in FindObjectsByType<TrafficVehicle>(FindObjectsSortMode.None))
            {
                if (other == null || !other.gameObject.activeInHierarchy) continue;
                if (other.IsCrossTraffic || other.LaneIndex != lane) continue;
                if (Mathf.Abs(other.transform.position.z - z) < minGap)
                    return;
            }

            var rented = _pool.Rent(id, new Vector3(x, 0.4f, z), Quaternion.identity);
            if (rented == null) return;

            var vehicle = rented.GetComponent<TrafficVehicle>();
            if (vehicle == null)
                vehicle = rented.gameObject.AddComponent<TrafficVehicle>();

            float speed = Random.Range(6f, 12f);
            vehicle.Activate(TrafficKind.Civilian, lane, speed, false, new Vector3(x, 0.4f, z));
        }

        /// <summary>Called by intersection when player runs a red light.</summary>
        public void SpawnCrossTraffic(Vector3 origin, float speed = 22f)
        {
            var rented = _pool.Rent(_crossPoolId, origin, Quaternion.Euler(0f, 90f, 0f));
            if (rented == null) return;

            var vehicle = rented.GetComponent<TrafficVehicle>();
            if (vehicle == null)
                vehicle = rented.gameObject.AddComponent<TrafficVehicle>();

            vehicle.Activate(TrafficKind.CrossHazard, -1, speed, true, origin);
        }
    }
}
