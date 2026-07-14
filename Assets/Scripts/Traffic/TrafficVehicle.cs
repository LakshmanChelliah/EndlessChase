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
        const float MinGap = 10f;
        const float BumperGap = 3.5f;

        public TrafficKind Kind;
        public int LaneIndex;
        public float Speed = 10f;
        public bool IsCrossTraffic;

        PooledObject _pooled;
        float _cruiseSpeed;
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
            _cruiseSpeed = speed;
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
            {
                p.x += Speed * dt; // cross from left toward right
            }
            else
            {
                // Follow-the-leader: ease off when closing on a car ahead in-lane
                TrafficVehicle lead = null;
                float bestGap = float.PositiveInfinity;
                var others = FindObjectsByType<TrafficVehicle>(FindObjectsSortMode.None);
                for (int i = 0; i < others.Length; i++)
                {
                    var o = others[i];
                    if (o == null || o == this || !o.gameObject.activeInHierarchy) continue;
                    if (o.IsCrossTraffic || o.LaneIndex != LaneIndex) continue;
                    float gap = o.transform.position.z - p.z;
                    if (gap > 0.05f && gap < bestGap)
                    {
                        bestGap = gap;
                        lead = o;
                    }
                }

                if (lead != null && bestGap < MinGap)
                {
                    float room = Mathf.Max(0f, (bestGap - BumperGap) / (MinGap - BumperGap));
                    float cap = lead.Speed * room;
                    Speed = Mathf.Min(Speed, Mathf.Lerp(Speed, cap, 1f - Mathf.Exp(-8f * dt)));
                    if (bestGap < BumperGap + 0.5f)
                        Speed = Mathf.Min(Speed, lead.Speed * 0.15f);
                }
                else if (Speed < _cruiseSpeed * 0.95f)
                {
                    Speed = Mathf.MoveTowards(Speed, _cruiseSpeed, 4f * dt);
                }

                p.z += Speed * dt;

                if (lead != null && p.z > lead.transform.position.z - BumperGap)
                {
                    p.z = lead.transform.position.z - BumperGap;
                    Speed = Mathf.Min(Speed, lead.Speed);
                }
            }

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
