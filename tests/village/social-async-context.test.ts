import {it,expect} from 'vitest';import {prepareCurriculumEpisode} from '../../src/games/camp/village/scenarios/curriculum';import {socialSemanticSignature} from '../../scripts/world/village-society';
it('ordinary work energy use and nearby motion do not invalidate the same negotiation',()=>{
 const s=prepareCurriculumEpisode('life','companionship',1001);s.actors.worker.body.energy=80;s.actors.partner.body.energy=80;s.social.issues.test={id:'test',participants:['worker','partner'],basisRefs:[],revision:1,status:'negotiating'};
 const before=socialSemanticSignature(s,'test');s.actors.worker.position.x+=.2;s.actors.worker.body.energy-=2;expect(socialSemanticSignature(s,'test')).toBe(before);
 s.actors.partner.body.downed=true;expect(socialSemanticSignature(s,'test')).not.toBe(before);
});
