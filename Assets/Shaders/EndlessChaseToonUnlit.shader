// DEPRECATED — arcade cel path. New assets use EndlessChase/MobilePBR (Fake GTA V).
Shader "EndlessChase/ToonUnlit"
{
    Properties
    {
        _BaseMap ("Atlas", 2D) = "white" {}
        _BaseColor ("Color", Color) = (1,1,1,1)
        _CelBands ("Cel Bands", Range(1,4)) = 3
        _LightDir ("Fake Light Dir", Vector) = (0.35, 1, -0.2, 0)
        _ShadowTint ("Shadow Tint", Color) = (0.75, 0.78, 0.9, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Back
        ZWrite On

        Pass
        {
            Name "ToonUnlit"
            Tags { "LightMode"="UniversalForward" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                half4 _BaseColor;
                half _CelBands;
                float4 _LightDir;
                half4 _ShadowTint;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
                float4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            Varyings vert(Attributes v)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_TRANSFER_INSTANCE_ID(v, o);
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.color = v.color;
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                half4 tex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv);
                half3 baseCol = tex.rgb * _BaseColor.rgb * i.color.rgb;

                float3 n = normalize(i.normalWS);
                float3 l = normalize(_LightDir.xyz);
                float ndl = saturate(dot(n, l));

                float bands = max(1.0, _CelBands);
                float cel = floor(ndl * bands) / bands;
                // Soft lift so unlit faces stay readable on mobile
                cel = lerp(0.55, 1.0, cel);

                half3 shaded = baseCol * cel;
                shaded = lerp(shaded * _ShadowTint.rgb, shaded, cel);

                return half4(shaded, 1);
            }
            ENDHLSL
        }
    }

    // Built-in fallback for non-URP editor previews
    FallBack "Unlit/Texture"
}
