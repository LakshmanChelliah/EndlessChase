using EndlessChase.Pooling;
using EndlessChase.RiskReward;
using UnityEngine;

namespace EndlessChase.Level
{
    /// <summary>
    /// Modular road tile. Length must match LevelManager.SegmentLength (20m).
    /// </summary>
    public sealed class RoadSegment : MonoBehaviour
    {
        public BiomeType Biome;
        public bool IsIntersection;
        public float Length = 20f;

        public TrafficLightController TrafficLight;
        public Transform[] CrossTrafficSpawnPoints;
        public Transform[] CoinSockets;
        public Transform[] PropSockets;

        PooledObject _pooled;

        void Awake()
        {
            _pooled = GetComponent<PooledObject>();
        }

        public void OnSpawned(BiomeType biome, bool intersection)
        {
            Biome = biome;
            IsIntersection = intersection;
            if (TrafficLight != null)
                TrafficLight.ResetCycle(intersection);
        }

        public void Recycle()
        {
            if (_pooled != null)
                _pooled.ReturnToPool();
            else
                gameObject.SetActive(false);
        }
    }
}
