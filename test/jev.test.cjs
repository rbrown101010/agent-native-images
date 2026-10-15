const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { rankImage, parseRanking } = require('../jev-ranking.cjs');
const answers = Object.fromEntries(['relevance','clarity','sticker'].map(name => [name,{type:'score',score:3.6,confidence:.8}]));
test('Jev request contains decodable image assets, opt-in header, typed rubrics and preserved confidence', async () => {
 const bytes = await sharp({create:{width:30,height:100,channels:4,background:'red'}}).png().toBuffer();
 const result = await rankImage(bytes,{title:'logo',width:30,height:100},{key:'test',query:'logo',fetchImpl:async(url,options)=>{
 assert.equal(url,'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
 assert.equal(options.headers['TypeSafe-Danger-Zone-Images'],'true');
 const body=JSON.parse(options.body);
 if (body.questions.imageCheck) return {ok:true,json:async()=>({answers:{imageCheck:{choice:'b'}}})};
 const image=body.assets[body.state.picture];
 const meta=await sharp(Buffer.from(image.data_base64,'base64')).metadata();
 assert.equal(meta.width,768); assert.equal(meta.height,768); assert.equal(body.state.originalWidth,30);
 return {ok:true,json:async()=>({model:'jev-1.14.0',answers})};
 }});
 assert.equal(result.score,90); assert.equal(result.scores.sticker.confidence,80);
});
test('invalid results fail rather than fabricate a score',()=>{
 assert.throws(()=>parseRanking({answers:{}}),/invalid/);
 assert.equal(parseRanking({answers:Object.fromEntries(Object.keys(answers).map(k=>[k,{type:'score',score:2}]))}).scores.sticker.confidence,null);
});
test('Gateway credit failure is actionable',async()=>{
 const bytes=await sharp({create:{width:300,height:300,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(rankImage(bytes,{}, {key:'credit-test',fetchImpl:async()=>({ok:false,status:402})}),/credits/);
});

test('text-only gateway responses cannot produce visual rankings', async()=>{
 const {verifyVision}=require('../jev-ranking.cjs');
 await assert.rejects(verifyVision('no-images','typesafe-ai/jev',async()=>({ok:true,json:async()=>({answers:{imageCheck:{choice:'unavailable'}}})})),/cannot see images/);
});
