Shader "CampMind/Forest Terrain"
{
    Properties { _BaseColor("Tint",Color)=(1,1,1,1) }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;
            CBUFFER_END
            struct Input { float4 vertex:POSITION;float3 normal:NORMAL;half4 color:COLOR; };
            struct Vary { float4 position:SV_POSITION;float3 world:TEXCOORD0;float3 normal:TEXCOORD1;half4 color:COLOR;float fog:TEXCOORD2; };
            Vary Vert(Input i){Vary o;o.world=TransformObjectToWorld(i.vertex.xyz);o.position=TransformWorldToHClip(o.world);o.normal=TransformObjectToWorldNormal(i.normal);o.color=i.color;o.fog=ComputeFogFactor(o.position.z);return o;}
            half4 Frag(Vary i):SV_Target
            {
                Light sun=GetMainLight(TransformWorldToShadowCoord(i.world));half3 n=normalize(i.normal);
                float detail=frac(sin(dot(floor(i.world.xz*8),float2(12.9898,78.233)))*43758.5453);
                half3 illumination=SampleSH(n)+sun.color*saturate(dot(n,sun.direction))*sun.shadowAttenuation;
                half3 c=i.color.rgb*_BaseColor.rgb*(.93+detail*.14)*max(illumination,half3(.12,.12,.12));
                return half4(MixFog(c,i.fog),1);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
        UsePass "Universal Render Pipeline/Lit/DepthOnly"
    }
}
