Shader "CampMind/New World River"
{
    Properties { _BaseColor("River colour",Color)=(.39,.76,.91,.25) }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;
            CBUFFER_END
            float _NewWorldDaylight;
            int _RockCount;
            float4 _RiverRockData[64];
            struct Input { float4 positionOS:POSITION; float2 uv:TEXCOORD0;float2 width:TEXCOORD1; };
            struct Vary { float4 positionCS:SV_POSITION; float2 uv:TEXCOORD0;float width:TEXCOORD1;float3 world:TEXCOORD2;float rapid:TEXCOORD3; };
            Vary Vert(Input i){Vary o;o.world=TransformObjectToWorld(i.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.world);o.uv=i.uv;o.width=i.width.x;o.rapid=i.width.y;return o;}
            float Hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
            float Noise(float2 p){float2 a=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(Hash(a),Hash(a+float2(1,0)),f.x),lerp(Hash(a+float2(0,1)),Hash(a+1),f.x),f.y);}
            half4 Frag(Vary i):SV_Target
            {
                float flow=i.uv.x-_Time.y*.45;
                float2 p=float2(flow*.5,i.uv.y*i.width*.2);
                float ripple=Noise(p*3+Noise(p*.7)*2);
                float streak=1-smoothstep(.012,.065,abs(Noise(p*3+float2(Noise(p),Noise(p+12))*2)-.52));
                float shore=1-smoothstep(.15,.9,min(i.uv.y,1-i.uv.y)*i.width);
                float obstacle=0;
                for(int rock=0;rock<_RockCount;rock++){
                    float4 body=_RiverRockData[rock];float distance=length(i.world.xz-body.xy),rim=abs(distance-body.z);
                    obstacle=max(obstacle,(1-smoothstep(.15,.85,rim))*(.5+.5*Noise(i.world.xz*2+_Time.y*.4)));
                }
                float foam=saturate(shore*(.06+.09*pow(ripple,3))+streak*.035*Noise(p*.8+17)+saturate(i.rapid*1.3)*(.08+.10*ripple)+obstacle*.22);
                float depth=Noise(i.world.xz*.23)*.12+Noise(i.world.xz*.65-_Time.y*.12)*.07;
                half3 colour=lerp(_BaseColor.rgb*(.83+depth),half3(.91,.96,.91),foam);
                half3 illumination=half3(.98,1.03,1.06)*max(.025,_NewWorldDaylight);
                float fresnel=pow(1-saturate(dot(normalize(GetWorldSpaceViewDir(i.world)),float3(0,1,0))),4);
                return half4(colour*illumination,saturate(_BaseColor.a+fresnel*.2+foam*.18));
            }
            ENDHLSL
        }
    }
}
