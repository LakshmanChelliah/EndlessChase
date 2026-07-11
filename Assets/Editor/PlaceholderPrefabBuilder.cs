using UnityEditor;
using UnityEngine;

namespace EndlessChase.Editor
{
    /// <summary>
    /// Creates primitive placeholder prefab meshes for pool wiring before AI art arrives.
    /// Menu: EndlessChase/Create Placeholder Prefabs
    /// </summary>
    public static class PlaceholderPrefabBuilder
    {
        [MenuItem("EndlessChase/Create Placeholder Prefabs")]
        static void Create()
        {
            var root = "Assets/Prefabs/Placeholders";
            if (!AssetDatabase.IsValidFolder("Assets/Prefabs"))
                AssetDatabase.CreateFolder("Assets", "Prefabs");
            if (!AssetDatabase.IsValidFolder(root))
                AssetDatabase.CreateFolder("Assets/Prefabs", "Placeholders");

            CreateCar($"{root}/car_player.prefab", new Color(1f, 0.718f, 0.012f));
            CreateCar($"{root}/car_police.prefab", new Color(0.114f, 0.306f, 0.847f));
            CreateCar($"{root}/car_civ_sedan.prefab", new Color(0.29f, 0.565f, 0.643f));
            CreateBox($"{root}/car_cross.prefab", new Color(0.914f, 0.769f, 0.416f), new Vector3(2f, 1.2f, 3.5f));
            CreateBox($"{root}/tile_city_straight.prefab", new Color(0.169f, 0.184f, 0.227f), new Vector3(12f, 0.2f, 20f));

            AssetDatabase.SaveAssets();
            Debug.Log("[EndlessChase] Placeholder prefabs created under Assets/Prefabs/Placeholders");
        }

        static void CreateCar(string path, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = System.IO.Path.GetFileNameWithoutExtension(path);
            go.transform.localScale = new Vector3(1.6f, 0.6f, 3.2f);
            go.GetComponent<Renderer>().sharedMaterial.color = color;
            go.tag = "Traffic";
            PrefabUtility.SaveAsPrefabAsset(go, path);
            Object.DestroyImmediate(go);
        }

        static void CreateBox(string path, Color color, Vector3 scale)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = System.IO.Path.GetFileNameWithoutExtension(path);
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial.color = color;
            PrefabUtility.SaveAsPrefabAsset(go, path);
            Object.DestroyImmediate(go);
        }
    }
}
