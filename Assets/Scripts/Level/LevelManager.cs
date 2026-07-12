using System.Collections.Generic;
using EndlessChase.Player;
using EndlessChase.Pooling;
using UnityEngine;

namespace EndlessChase.Level
{
    /// <summary>
    /// Spawns modular road prefabs from pools based on biome progression.
    /// Keeps a sliding window of segments ahead/behind the player.
    /// </summary>
    public sealed class LevelManager : MonoBehaviour
    {
        public const float SegmentLength = 20f;

        [SerializeField] ObjectPool _pool;
        [SerializeField] LanePlayerController _player;
        [SerializeField] BiomeDefinition[] _biomes;
        [SerializeField] int _segmentsAhead = 8;
        [SerializeField] int _segmentsBehind = 2;
        [SerializeField] float _cityUntilDistance = 400f;
        [SerializeField] float _suburbUntilDistance = 900f;

        readonly List<RoadSegment> _active = new List<RoadSegment>(16);
        float _nextSpawnZ;
        int _spawnIndex;
        int _intersectionCooldown;
        bool _running;

        public BiomeType CurrentBiome { get; private set; } = BiomeType.City;
        public IReadOnlyList<RoadSegment> ActiveSegments => _active;

        public void StartLevel()
        {
            ClearActive();
            _nextSpawnZ = 0f;
            _spawnIndex = 0;
            _intersectionCooldown = 2;
            _running = true;
            CurrentBiome = BiomeType.City;

            int total = _segmentsAhead + _segmentsBehind;
            for (int i = 0; i < total; i++)
                SpawnNext();
        }

        public void StopLevel()
        {
            _running = false;
        }

        void Update()
        {
            if (!_running || _player == null) return;

            float playerZ = _player.transform.position.z;
            UpdateBiome(playerZ);

            while (_nextSpawnZ < playerZ + _segmentsAhead * SegmentLength)
                SpawnNext();

            RecycleBehind(playerZ - _segmentsBehind * SegmentLength);
        }

        void UpdateBiome(float distance)
        {
            if (distance < _cityUntilDistance)
                CurrentBiome = BiomeType.City;
            else if (distance < _suburbUntilDistance)
                CurrentBiome = BiomeType.Suburb;
            else
                CurrentBiome = BiomeType.Highway;
        }

        BiomeDefinition GetBiomeDef(BiomeType type)
        {
            if (_biomes == null) return null;
            for (int i = 0; i < _biomes.Length; i++)
            {
                if (_biomes[i] != null && _biomes[i].biome == type)
                    return _biomes[i];
            }
            return _biomes.Length > 0 ? _biomes[0] : null;
        }

        void SpawnNext()
        {
            var def = GetBiomeDef(CurrentBiome);
            if (def == null || _pool == null) return;

            bool intersection = false;
            string poolId = null;

            bool canSpawnLight = _intersectionCooldown <= 0 && _spawnIndex > 2 &&
                def.intersectionPoolIds != null && def.intersectionPoolIds.Length > 0 &&
                Random.value < def.intersectionChance;

            if (canSpawnLight)
            {
                intersection = true;
                poolId = def.intersectionPoolIds[Random.Range(0, def.intersectionPoolIds.Length)];
                _intersectionCooldown = Mathf.Max(0, def.intersectionCooldownSegments);
            }
            else if (def.straightPoolIds != null && def.straightPoolIds.Length > 0)
            {
                poolId = def.straightPoolIds[Random.Range(0, def.straightPoolIds.Length)];
                if (_intersectionCooldown > 0)
                    _intersectionCooldown--;
            }
            else if (_intersectionCooldown > 0)
            {
                _intersectionCooldown--;
            }

            if (string.IsNullOrEmpty(poolId)) return;

            var rented = _pool.Rent(poolId, new Vector3(0f, 0f, _nextSpawnZ), Quaternion.identity, transform);
            if (rented == null) return;

            var segment = rented.GetComponent<RoadSegment>();
            if (segment == null)
                segment = rented.gameObject.AddComponent<RoadSegment>();

            segment.OnSpawned(CurrentBiome, intersection);
            _active.Add(segment);

            _nextSpawnZ += SegmentLength;
            _spawnIndex++;
        }

        void RecycleBehind(float minZ)
        {
            for (int i = _active.Count - 1; i >= 0; i--)
            {
                var seg = _active[i];
                if (seg == null)
                {
                    _active.RemoveAt(i);
                    continue;
                }

                if (seg.transform.position.z + SegmentLength < minZ)
                {
                    seg.Recycle();
                    _active.RemoveAt(i);
                }
            }
        }

        void ClearActive()
        {
            for (int i = 0; i < _active.Count; i++)
            {
                if (_active[i] != null)
                    _active[i].Recycle();
            }
            _active.Clear();
        }
    }
}
