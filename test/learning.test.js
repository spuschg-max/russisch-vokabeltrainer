'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const createApp=require('../app.js');
const DAY=86400000;
const NOW=1800000000000;
function fixture(ids=['a','b','c','d']){
 const app=createApp({words:ids.map(id=>({id,ru:id,de:id})),now:()=>NOW,random:()=>0});
 app.state.settings.typing=false;
 app.state.settings.direction='ru-de';
 return app;
}
function next(app){app.selectNext();return app.selection().id;}
function sequence(app,count,rating='good'){
 const ids=[];for(let i=0;i<count;i++){ids.push(app.selection().id);app.review(rating);}return ids;
}
function longReview(app,id,due=NOW){Object.assign(app.pFor(id),{seen:10,active:false,level:5,reviewStage:1,due,dirStreak:{'ru-de':5,'de-ru':5}});}
test('quick repeat returns after exactly two other answered cards, over multiple cycles',()=>{
 const app=fixture();app.quickRepeatCore.set('a',true);assert.equal(next(app),'a');
 assert.deepEqual(sequence(app,10),['a','b','c','a','d','b','a','c','d','a']);
 assert.equal(app.pFor('a').nextTurn,12);
});
test('multiple quick repeats remain ordered and outrank normal and due review cards',()=>{
 const app=fixture(['a','b','c','review','normal']);
 for(const id of ['a','b','c'])app.quickRepeatCore.set(id,true);
 longReview(app,'review',NOW-1);
 assert.equal(next(app),'a');
 assert.deepEqual(sequence(app,9),['a','b','c','a','b','c','a','b','c']);
 assert.equal(app.pFor('review').seen,10);
 assert.equal(app.pFor('normal').seen,0);
});
test('quick repeat due ties use vocabulary order, earlier due turns win',()=>{
 const app=fixture();for(const id of ['b','a'])app.quickRepeatCore.set(id,true);
 assert.equal(next(app),'a');app.state.sessionTurn=5;app.pFor('a').nextTurn=4;app.pFor('b').nextTurn=3;
 assert.equal(next(app),'b');
});
test('due long reviews precede normal cards, oldest first; future reviews wait',()=>{
 const app=fixture(['normal','future','recent','old']);longReview(app,'future',NOW+1);longReview(app,'recent',NOW);longReview(app,'old',NOW-1);
 assert.equal(next(app),'old');assert.equal(app.selection().mode,'review');
 app.review('good');assert.equal(app.selection().id,'recent');
 app.review('good');assert.equal(app.selection().id,'normal');assert.equal(app.selection().mode,'learning');
 assert.equal(app.pFor('old').due,NOW+30*DAY);
});
test('mixed practice changes to the weaker direction and needs both directions secure',()=>{
 const app=fixture(['a']);app.state.settings.direction='mixed';app.quickRepeatCore.set('a',true);
 assert.equal(next(app),'a');assert.equal(app.selection().direction,'ru-de');
 app.review('good');assert.equal(app.selection().direction,'de-ru');
 app.review('good');assert.equal(app.selection().direction,'ru-de');
 const p=app.pFor('a');p.quickRepeat=false;p.dirStreak={'ru-de':4,'de-ru':3};
 app.scheduleLearning(p,'good',true,'ru-de');assert.equal(p.active,true);assert.equal(p.due,0);
 app.selectNext();assert.equal(app.selection().direction,'de-ru');
 app.scheduleLearning(p,'good',true,'de-ru');app.scheduleLearning(p,'good',true,'de-ru');
 assert.equal(p.active,false);assert.equal(p.due,NOW+7*DAY);assert.equal(p.reviewStage,1);
});
for(const [rating,correct,gap,counter] of [['again',false,5,'wrong'],['hard',true,8,'hard']]){
 test(`learning ${rating} resets only the answered direction`,()=>{
  const app=fixture();app.state.sessionTurn=7;const p=app.pFor('a');p.dirStreak={'ru-de':3,'de-ru':4};
  app.scheduleLearning(p,rating,correct,'ru-de');assert.deepEqual(p.dirStreak,{'ru-de':0,'de-ru':4});assert.equal(p.nextTurn,7+gap);assert.equal(p[counter],1);
 });
 test(`long review ${rating} returns to learning`,()=>{
  const app=fixture();longReview(app,'a');app.state.sessionTurn=7;const p=app.pFor('a');
  app.scheduleLongReview(p,rating,correct,'de-ru');assert.equal(p.active,true);assert.equal(p.reviewStage,0);assert.equal(p.due,0);assert.equal(p.nextTurn,7+gap);assert.equal(p[counter],1);assert.deepEqual(p.dirStreak,{'ru-de':5,'de-ru':0});
 });
}
test('successful long reviews advance intervals and cap at one year',()=>{
 const app=fixture();longReview(app,'a');const p=app.pFor('a');
 for(const days of [30,90,180,365,365]){app.scheduleLongReview(p,'good',true,'ru-de');assert.equal(p.due,NOW+days*DAY);assert.equal(p.active,false);}
});
test('legacy migration without dirStreak restores learning and secure review states',()=>{
 const app=fixture(['learning','secure','postponed']);app.state.sessionTurn=9;
 Object.assign(app.pFor('learning'),{seen:2,level:2,streak:3,dirStreak:null});
 Object.assign(app.pFor('secure'),{seen:5,level:5,dirStreak:null});
 Object.assign(app.pFor('postponed'),{seen:1,level:1,streak:99,dirStreak:null});
 app.state.postponedIds=['postponed','deleted'];app.migrateLearningState();
 const p=app.pFor('learning');assert.deepEqual(p.dirStreak,{'ru-de':3,'de-ru':3});assert.equal(p.active,true);assert.equal(p.nextTurn,9);
 assert.deepEqual(app.pFor('secure').dirStreak,{'ru-de':5,'de-ru':5});assert.equal(app.pFor('secure').due,NOW+7*DAY);assert.equal(app.pFor('secure').active,false);
 assert.deepEqual(app.pFor('postponed').dirStreak,{'ru-de':4,'de-ru':4});assert.equal(app.pFor('postponed').active,false);assert.deepEqual(app.state.postponedIds,['postponed']);
 const snapshot=JSON.stringify(app.state);app.migrateLearningState();assert.equal(JSON.stringify(app.state),snapshot);
});
test('migration with dirStreak preserves asymmetric progress, clamps invalid values and is idempotent',()=>{
 const app=fixture(['a','b','c']);
 Object.assign(app.pFor('a'),{seen:2,level:2,dirStreak:{'ru-de':4,'de-ru':1}});
 Object.assign(app.pFor('b'),{seen:2,level:2,dirStreak:{'ru-de':99,'de-ru':-2}});
 Object.assign(app.pFor('c'),{seen:2,level:2,dirStreak:{'ru-de':'bad'}});
 app.migrateLearningState();assert.deepEqual(app.pFor('a').dirStreak,{'ru-de':4,'de-ru':1});assert.equal(app.pFor('a').streak,4);
 assert.deepEqual(app.pFor('b').dirStreak,{'ru-de':5,'de-ru':0});assert.deepEqual(app.pFor('c').dirStreak,{'ru-de':0,'de-ru':0});
 app.pFor('a').nextTurn=42;const snapshot=JSON.stringify(app.state);app.migrateLearningState();assert.equal(JSON.stringify(app.state),snapshot);
});
test('marking a quick-repeat card known retains its two-card repeat schedule',()=>{
 const app=fixture();app.quickRepeatCore.set('a',true);next(app);app.markCurrentKnown();
 assert.equal(app.pFor('a').nextTurn,3);assert.equal(app.pFor('a').active,true);assert.equal(app.pFor('a').due,0);
 assert.deepEqual(sequence(app,3),['b','c','a']);
});
