using EndlessChase.Pooling;
using UnityEngine;

namespace EndlessChase.Traffic
{
    public enum TrafficKind
    {
        Civilian,
        Police,
        CrossHazard
    }

    /// <summary>
    /// Pooled traffic vehicle moving in a lane (or crossing at intersections).
    /// </summary>
    public sealed class TrafficVehicle : MonoBehaviour
    {
        public TrafficKind Kind;
        public int LaneIndex;
        public float Speed = 10f;
        public bool IsCrossTraffic;

        PooledObject _pooled;
        float _life;

        void Awake()
        {
            _pooled = GetComponent<PooledObject>();
            if (!CompareTag("Traffic") && !CompareTag("Hazard"))
                gameObject.tag = Kind == TrafficKind.CrossHazard ? "Hazard" : "Traffic";
        }

        public void Activate(TrafficKind kind, int lane, float speed, bool cross, Vector3 position)
        {
            Kind = kind;
            LaneIndex = lane;
            Speed = speed;
            IsCrossTraffic = cross;
            _life = 12f;
            transform.position = position;
            gameObject.tag = kind == TrafficKind.CrossHazard ? "Hazard" : "Traffic";
            gameObject.SetActive(true);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            Vector3 p = transform.position;

            if (IsCrossTraffic)
                p.x += Speed * dt; // cross from left toward right
            else
                p.z += Speed * dt; // same direction, slower than player typically

            transform.position = p;
            _life -= dt;
            if (_life <= 0f)
                Recycle();
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
