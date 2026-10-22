Shader "CampMind/PixelWeather"
{
    Properties { [PerRendererData] _MainTex("Sprite",2D)="white"{} }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent" "RenderType"="Transparent" }
        Cull Off ZWrite Off Blend SrcAlpha OneMinusSrcAlpha
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            float _WeatherTime,_Rain,_Darkness,_Flash,_WindSlant,_Strike,_Aspect;
            struct Attributes {float3 positionOS:POSITION;float2 uv:TEXCOORD0;};
            struct Varyings {float4 positionCS:SV_POSITION;float2 uv:TEXCOORD0;};
            Varyings Vert(Attributes v){Varyings o;o.positionCS=TransformObjectToHClip(v.positionOS);o.uv=v.uv;return o;}
            float Hash(float n){return frac(sin(n*127.1+311.7)*43758.5453);}
            half4 Frag(Varyings i):SV_Target
            {
                float2 p=i.uv*float2(max(.1,_Aspect)*900,900);
                p.x+=p.y*_WindSlant;
                float column=floor(p.x/18),seed=Hash(column);
                float x=abs(frac(p.x/18)-(.15+seed*.7))*18;
                float tail=frac(p.y/115+seed*3+_WeatherTime*(2.3+seed));
                float drop=(1-smoothstep(.45,1.2,x))*smoothstep(.72,.84,tail)*(1-smoothstep(.96,1,tail));
                drop*=step(seed,_Rain)*saturate(_Rain*5);
                float alpha=_Darkness+drop*.48*(1-_Darkness);
                float3 color=lerp(float3(.025,.045,.09),float3(.63,.76,.86),drop*.85);
                // A short angular bolt is tied to a newly observed authoritative strike.
                float segment=i.uv.y*18;
                float bend=lerp(Hash(floor(segment)+_Strike),Hash(floor(segment)+1+_Strike),frac(segment))-.5;
                float boltX=.2+Hash(_Strike)*.6+bend*.06;
                float bolt=(1-smoothstep(.001,.0035,abs(i.uv.x-boltX)))*step(.44,i.uv.y)*step(.45,_Flash);
                float light=max(_Flash*.38,bolt*.95);
                color=lerp(color,float3(.84,.91,1),saturate(light/max(.001,alpha+light)));
                alpha=alpha+light*(1-alpha);
                return half4(color,alpha);
            }
            ENDHLSL
        }
    }
}
