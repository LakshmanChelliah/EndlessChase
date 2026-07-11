using UnityEngine;

namespace EndlessChase.Pooling
{
    /// <summary>
    /// Marker + helpers for objects managed by <see cref="ObjectPool"/>.
    /// Avoids runtime Instantiate/Destroy; return to pool instead.
    /// </summary>
    public sealed class PooledObject : MonoBehaviour
    {
        public string PoolId { get; private set; }
        ObjectPool _pool;

        public void Bind(ObjectPool pool, string poolId)
        {
            _pool = pool;
            PoolId = poolId;
        }

        public void ReturnToPool()
        {
            if (_pool != null)
                _pool.Return(this);
            else
                gameObject.SetActive(false);
        }
    }
}
