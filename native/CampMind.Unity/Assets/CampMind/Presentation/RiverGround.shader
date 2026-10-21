Shader "CampMind/River Ground"
{
    Properties { _BaseColor("Sand and bank colour",Color)=(.66,.65,.49,1) }
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
            float _NewWorldDaylight;
            struct Input {float4 positionOS:POSITION;float3 normalOS:NORMAL;};
            struct Vary {float4 positionCS:SV_POSITION;float3 world:TEXCOORD0;float3 normal:TEXCOORD1;float fog:TEXCOORD2;};
            Vary Vert(Input i){Vary o;o.world=TransformObjectToWorld(i.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.world);o.normal=TransformObjectToWorldNormal(i.normalOS);o.fog=ComputeFogFactor(o.positionCS.z);return o;}
            float Hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
            half4 Frag(Vary i):SV_Target
            {
                float2 p=i.world.xz*3.5;float2 cell=floor(p);float2 f=frac(p)-.5;float stone=(1-smoothstep(.08,.18,length(f)))*step(.97,Hash(cell));
                float grain=Hash(floor(i.world.xz*75));half3 colour=_BaseColor.rgb*(.96+.06*grain);colour=lerp(colour,_BaseColor.rgb*.87,stone*.4);
                Light light=GetMainLight();float diffuse=.55+.45*saturate(dot(normalize(i.normal),light.direction));
                return half4(MixFog(colour*diffuse*max(.025,_NewWorldDaylight),i.fog),1);
            }
            ENDHLSL
        }
    }
}
