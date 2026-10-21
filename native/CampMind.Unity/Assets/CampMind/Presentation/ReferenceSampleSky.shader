Shader "CampMind/Reference Sample Sky"
{
    Properties { _Top("Zenith",Color)=(.3,.48,.65,1) _Horizon("Horizon",Color)=(.84,.77,.64,1) }
    SubShader {
        Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" }
        Cull Off ZWrite Off
        Pass {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _Top,_Horizon;
            CBUFFER_END
            struct A{float4 p:POSITION;};struct V{float4 p:SV_POSITION;float3 dir:TEXCOORD0;};
            V vert(A a){V o;o.p=TransformObjectToHClip(a.p.xyz);o.dir=a.p.xyz;return o;}
            float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
            float noise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(hash(i),hash(i+float2(1,0)),f.x),lerp(hash(i+float2(0,1)),hash(i+1),f.x),f.y);}
            half4 frag(V i):SV_Target{
                float3 d=normalize(i.dir);float h=saturate(d.y);half3 c=lerp(_Horizon.rgb,_Top.rgb,pow(h,.5));
                float2 uv=d.xz/(max(.08,d.y)+.3)*3;float clouds=noise(uv)*.55+noise(uv*2.2)*.3+noise(uv*5)*.15;
                float mask=smoothstep(.53,.78,clouds)*smoothstep(.01,.18,d.y)*.65;c=lerp(c,half3(.82,.84,.82),mask);
                float sun=saturate(dot(d,normalize(float3(-.6,.24,.75))));c+=half3(1,.7,.3)*pow(sun,24)*.08;
                c=lerp(half3(.57,.63,.61),c,smoothstep(-.15,.02,d.y));return half4(c,1);
            }
            ENDHLSL
        }
    }
}
