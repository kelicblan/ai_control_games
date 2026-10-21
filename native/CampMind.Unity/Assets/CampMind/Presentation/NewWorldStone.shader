Shader "CampMind/New World Stone"
{
    Properties { _BaseColor("Stone colour",Color)=(.59,.55,.41,1) }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;
            CBUFFER_END
            struct Input{float4 positionOS:POSITION;float3 normalOS:NORMAL;};
            struct Vary{float4 positionCS:SV_POSITION;float3 world:TEXCOORD0;half3 normal:TEXCOORD1;half fog:TEXCOORD2;};
            Vary Vert(Input i){Vary o;o.world=TransformObjectToWorld(i.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.world);o.normal=TransformObjectToWorldNormal(i.normalOS);o.fog=ComputeFogFactor(o.positionCS.z);return o;}
            half4 Frag(Vary i):SV_Target
            {
                half3 normal=normalize(i.normal);Light light=GetMainLight();float diffuse=saturate(dot(normal,light.direction));
                float illumination=saturate(dot(SampleSH(normal),half3(.15,.30,.05))+dot(light.color,half3(.21,.51,.08))*(.4+.25*diffuse));
                float grain=sin(i.world.x*13+i.world.y*23+i.world.z*17)*sin(i.world.z*7-i.world.x*11);
                float2 tiles=i.world.xz*float2(.65,.9);tiles.x+=floor(tiles.y)*.5;float2 cell=frac(tiles);float edge=min(min(cell.x,1-cell.x),min(cell.y,1-cell.y));
                float mortar=1-smoothstep(.012,.045,edge);
                float block=frac(sin(dot(floor(tiles),float2(12.9898,78.233)))*43758.5453);
                half3 colour=_BaseColor.rgb*(.86+block*.11+grain*.025-mortar*.17)*illumination;
                return half4(MixFog(colour,i.fog),1);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
    }
}
