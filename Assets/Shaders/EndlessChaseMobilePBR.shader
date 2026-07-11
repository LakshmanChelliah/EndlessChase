Shader "EndlessChase/MobilePBR"
{
    Properties
    {
        _BaseMap ("Albedo", 2D) = "white" {}
        _BaseColor ("Color", Color) = (1,1,1,1)
        _ORMMap ("ORM (R=AO G=Rough B=Metal)", 2D) = "white" {}
        _BumpMap ("Normal", 2D) = "bump" {}
        _BumpScale ("Normal Scale", Range(0,2)) = 1
        _Metallic ("Metallic Multiplier", Range(0,1)) = 1
        _Smoothness ("Smoothness Multiplier", Range(0,1)) = 1
        [Toggle(_NORMALMAP)] _UseNormal ("Use Normal Map", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "RenderType"="Opaque"
            "Queue"="Geometry"
            "RenderPipeline"="UniversalPipeline"
        }
        LOD 200
        Cull Back
        ZWrite On

        Pass
        {
            Name "MobilePBR"
            Tags { "LightMode"="UniversalForward" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile_fog
            #pragma shader_feature_local _NORMALMAP
            // Intentionally no additional lights / no shadow keywords — WebGL mobile tier

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
            TEXTURE2D(_ORMMap);  SAMPLER(sampler_ORMMap);
            TEXTURE2D(_BumpMap); SAMPLER(sampler_BumpMap);

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                half4 _BaseColor;
                half _BumpScale;
                half _Metallic;
                half _Smoothness;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float4 tangentOS : TANGENT;
                float2 uv : TEXCOORD0;
                float4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float fogCoord : TEXCOORD1;
                float3 normalWS : TEXCOORD2;
                float3 viewDirWS : TEXCOORD3;
                float4 color : COLOR;
            #if defined(_NORMALMAP)
                float4 tangentWS : TEXCOORD4;
            #endif
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            Varyings vert(Attributes v)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_TRANSFER_INSTANCE_ID(v, o);

                VertexPositionInputs pos = GetVertexPositionInputs(v.positionOS.xyz);
                VertexNormalInputs nrm = GetVertexNormalInputs(v.normalOS, v.tangentOS);

                o.positionCS = pos.positionCS;
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.normalWS = nrm.normalWS;
                o.viewDirWS = GetWorldSpaceViewDir(pos.positionWS);
                o.fogCoord = ComputeFogFactor(pos.positionCS.z);
                o.color = v.color;
            #if defined(_NORMALMAP)
                real sign = v.tangentOS.w * GetOddNegativeScale();
                o.tangentWS = float4(nrm.tangentWS.xyz, sign);
            #endif
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);

                half4 albedoTex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv);
                half3 albedo = albedoTex.rgb * _BaseColor.rgb * i.color.rgb;

                half3 orm = SAMPLE_TEXTURE2D(_ORMMap, sampler_ORMMap, i.uv).rgb;
                half ao = orm.r;
                half roughness = saturate(orm.g);
                half metallic = saturate(orm.b) * _Metallic;
                half smoothness = saturate((1.0h - roughness) * _Smoothness);

                float3 n = normalize(i.normalWS);
            #if defined(_NORMALMAP)
                float3 t = normalize(i.tangentWS.xyz);
                float3 b = normalize(cross(n, t) * i.tangentWS.w);
                half3 nTS = UnpackNormalScale(SAMPLE_TEXTURE2D(_BumpMap, sampler_BumpMap, i.uv), _BumpScale);
                n = normalize(TransformTangentToWorld(nTS, half3x3(t, b, n)));
            #endif

                float3 v = SafeNormalize(i.viewDirWS);
                Light mainLight = GetMainLight();
                float3 l = mainLight.direction;
                half3 lightColor = mainLight.color;

                // Minimal mobile BRDF: Lambert diffuse + Blinn specular scaled by metal/smooth
                half ndl = saturate(dot(n, l));
                half3 diffuse = albedo * (1.0h - metallic) * ndl;

                float3 h = SafeNormalize(l + v);
                half ndh = saturate(dot(n, h));
                half specPower = exp2(10.0h * smoothness + 1.0h);
                half3 specCol = lerp(half3(0.04h, 0.04h, 0.04h), albedo, metallic);
                half3 specular = specCol * pow(ndh, specPower) * smoothness;

                half3 ambient = SampleSH(n) * albedo * ao * 0.65h;
                half3 color = (diffuse + specular) * lightColor + ambient;
                color *= ao;

                color = MixFog(color, i.fogCoord);
                return half4(color, 1);
            }
            ENDHLSL
        }
    }

    FallBack "Universal Render Pipeline/Lit"
}
