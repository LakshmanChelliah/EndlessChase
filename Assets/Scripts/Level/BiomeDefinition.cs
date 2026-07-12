using UnityEngine;

namespace EndlessChase.Level
{
    public enum BiomeType
    {
        City = 0,
        Suburb = 1,
        Highway = 2
    }

    [CreateAssetMenu(fileName = "BiomeDefinition", menuName = "EndlessChase/Biome Definition")]
    public sealed class BiomeDefinition : ScriptableObject
    {
        public BiomeType biome;
        public string[] straightPoolIds;
        public string[] intersectionPoolIds;
        [Range(0f, 1f)] public float intersectionChance = 0.14f;
        [Tooltip("Minimum straight segments between traffic-light intersections.")]
        [Min(0)] public int intersectionCooldownSegments = 3;
        [Range(0f, 1f)] public float trafficDensity = 0.35f;
        public Color accentColor = Color.white;
    }
}
