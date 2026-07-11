using System.Collections.Generic;
using UnityEngine;

namespace EndlessChase.Pooling
{
    /// <summary>
    /// Aggressive object pool: prewarm, rent, return. Zero GC in steady state
    /// when callers avoid LINQ/boxing in hot paths.
    /// </summary>
    public sealed class ObjectPool : MonoBehaviour
    {
        [System.Serializable]
        public struct PoolConfig
        {
            public string id;
            public GameObject prefab;
            public int prewarm;
        }

        [SerializeField] PoolConfig[] _configs;
        [SerializeField] Transform _inactiveRoot;

        readonly Dictionary<string, Queue<PooledObject>> _queues = new Dictionary<string, Queue<PooledObject>>(16);
        readonly Dictionary<string, GameObject> _prefabs = new Dictionary<string, GameObject>(16);

        void Awake()
        {
            if (_inactiveRoot == null)
            {
                var go = new GameObject("PoolInactive");
                go.transform.SetParent(transform, false);
                _inactiveRoot = go.transform;
            }

            if (_configs == null) return;

            for (int i = 0; i < _configs.Length; i++)
            {
                var cfg = _configs[i];
                if (cfg.prefab == null || string.IsNullOrEmpty(cfg.id)) continue;

                _prefabs[cfg.id] = cfg.prefab;
                if (!_queues.ContainsKey(cfg.id))
                    _queues[cfg.id] = new Queue<PooledObject>(cfg.prewarm);

                for (int n = 0; n < cfg.prewarm; n++)
                    _queues[cfg.id].Enqueue(CreateInstance(cfg.id, cfg.prefab));
            }
        }

        PooledObject CreateInstance(string id, GameObject prefab)
        {
            var go = Instantiate(prefab, _inactiveRoot);
            go.name = prefab.name;
            go.SetActive(false);

            var pooled = go.GetComponent<PooledObject>();
            if (pooled == null)
                pooled = go.AddComponent<PooledObject>();

            pooled.Bind(this, id);
            return pooled;
        }

        public PooledObject Rent(string id, Vector3 position, Quaternion rotation, Transform parent = null)
        {
            if (!_queues.TryGetValue(id, out var queue))
            {
                Debug.LogError($"[ObjectPool] Unknown pool id '{id}'");
                return null;
            }

            PooledObject item = queue.Count > 0 ? queue.Dequeue() : CreateInstance(id, _prefabs[id]);
            var t = item.transform;
            if (parent != null)
                t.SetParent(parent, false);
            t.SetPositionAndRotation(position, rotation);
            item.gameObject.SetActive(true);
            return item;
        }

        public void Return(PooledObject item)
        {
            if (item == null) return;
            item.gameObject.SetActive(false);
            item.transform.SetParent(_inactiveRoot, false);

            if (!_queues.TryGetValue(item.PoolId, out var queue))
            {
                Destroy(item.gameObject);
                return;
            }

            queue.Enqueue(item);
        }

        public void RegisterPrefab(string id, GameObject prefab, int prewarm = 0)
        {
            if (string.IsNullOrEmpty(id) || prefab == null) return;
            _prefabs[id] = prefab;
            if (!_queues.ContainsKey(id))
                _queues[id] = new Queue<PooledObject>(prewarm);

            for (int i = 0; i < prewarm; i++)
                _queues[id].Enqueue(CreateInstance(id, prefab));
        }
    }
}
