Shader "CampMind/Reference Sample Water"
{
    Properties { _BaseColor("Water",Color)=(.12,.32,.34,1) }
    SubShader {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" }
        Pass {
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
            float4 _BaseColor;
            CBUFFER_END
            struct A{float4 positionOS:POSITION;float2 uv:TEXCOORD0;};
            struct V{float4 positionCS:SV_POSITION;float3 world:TEXCOORD0;float2 uv:TEXCOORD1;float fog:TEXCOORD2;};
            V vert(A a){V o;o.world=TransformObjectToWorld(a.positionOS.xyz);o.world.y+=sin(o.world.z*1.8+_Time.y*2)*.025;o.positionCS=TransformWorldToHClip(o.world);o.uv=a.uv;o.fog=ComputeFogFactor(o.positionCS.z);return o;}
            float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
            float noise(float2 p){float2 a=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(hash(a),hash(a+float2(1,0)),f.x),lerp(hash(a+float2(0,1)),hash(a+1),f.x),f.y);}
            half4 frag(V i):SV_Target{
                float2 flow=float2(i.world.x*1.3,i.world.z*.45+_Time.y*.7);
                float wave=noise(flow)*.65+noise(flow*2.1)*.35;
                float foam=smoothstep(.7,.86,wave)*.45+saturate((abs(i.uv.x-.5)*2-.86)*5)*.25;
                float3 n=normalize(float3(cos(i.world.x*2+_Time.y)*.12,1,sin(i.world.z*3-_Time.y*3)*.18));
                Light light=GetMainLight();float3 v=SafeNormalize(GetWorldSpaceViewDir(i.world));float glint=pow(saturate(dot(n,normalize(light.direction+v))),100);
                half3 color=lerp(_BaseColor.rgb,half3(.65,.77,.73),saturate(foam))+light.color*glint*.08;
                return half4(MixFog(color,i.fog),1);
            }
            ENDHLSL
        }
    }
}
