const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('./pb_hooks/archive-core.js');
const clone = value => JSON.parse(JSON.stringify(value));
const recipients = ['administrator@example.com','principal@example.com'];
function fixture() {
    const rows = [{id:'done',status:'Checked Out',name:'A, "B"',zone:'=HYPERLINK("bad")',created:'2026-10-05',updated:'2026-10-05'}, {id:'active',status:'Checked In',name:'Still here'}];
    const state = {rows, csv:{}, batches:{}, sent:[], failMail:false, corrupt:false, clearFail:false};
    const adapter = {
        recipients: () => recipients,
        hash: text => crypto.createHash('sha256').update(text).digest('hex'), now: () => '2026-10-06T06:00:00.000Z', newId: () => 'batch',
        records: () => clone(state.rows.filter(row => row.status === 'Checked Out')),
        list: () => Object.values(state.batches).map(clone),
        load: id => clone(state.batches[id]), save: batch => { state.batches[batch.id] = clone(batch); },
        writeCsv: (id, text) => { state.csv[id] = text; }, readCsv: id => state.corrupt ? 'corrupt' : state.csv[id],
        validate: (records, allowMissing) => records.forEach(saved => {
            const row = state.rows.find(r => r.id === saved.id);
            if (!row && allowMissing) return;
            if (!row || JSON.stringify(row) !== JSON.stringify(saved) || row.status !== 'Checked Out') throw Error('changed');
        }),
        send: (_, recipient) => { if(state.failMail && recipient === recipients[1]) throw Error('mail failed'); state.sent.push(recipient); },
        clear: records => { adapter.validate(records, true); if(state.clearFail) throw Error('transaction failed'); state.rows = state.rows.filter(r => !records.some(s => s.id === r.id)); return records.length; }
    };
    return {state,adapter};
}
{
    const {state,adapter} = fixture();
    const batch = core.prepare(adapter);
    assert.equal(batch.count,1); assert.equal(state.rows.length,2); assert.equal(state.sent.length,0);
    assert.match(state.csv.batch, /'\=HYPERLINK/); assert.match(state.csv.batch, /A, ""B""/);
    state.failMail = true;
    assert.throws(() => core.finish(adapter,'batch'), /mail failed/);
    assert.equal(state.rows.length,2); assert.equal(state.sent.length,1);
    state.failMail = false;
    const done = core.finish(adapter,'batch');
    assert.equal(done.state,'cleared'); assert.equal(state.sent.length,2);
    assert.equal(state.rows[0].id,'active'); assert.ok(state.csv.batch);
    core.finish(adapter,'batch'); assert.equal(state.sent.length,2);
}
{
    const {state,adapter} = fixture(); core.prepare(adapter); state.corrupt = true;
    assert.throws(() => core.finish(adapter,'batch'), /verification/);
    assert.equal(state.sent.length,0); assert.equal(state.rows.length,2);
}
{
    const {state,adapter} = fixture(); core.prepare(adapter); state.rows[0].status='Checked In';
    assert.throws(() => core.finish(adapter,'batch'), /changed/);
    assert.equal(state.sent.length,0); assert.equal(state.rows.length,2);
}
{
    const {state,adapter} = fixture(); core.prepare(adapter); state.clearFail=true;
    assert.throws(() => core.finish(adapter,'batch'), /transaction/); assert.equal(state.rows.length,2);
    state.clearFail=false; core.finish(adapter,'batch'); assert.equal(state.sent.length,2);
}
{
    const {state,adapter} = fixture(); core.prepare(adapter);
    state.batches.batch.sent=recipients.slice(); state.batches.batch.state='clearing';
    state.rows=state.rows.filter(r=>r.id!=='done');
    core.finish(adapter,'batch'); assert.equal(state.sent.length,0); assert.equal(state.rows[0].id,'active');
}
const source=fs.readFileSync('index.html','utf8');
for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
assert.ok(!source.includes('deleteAdminLog')); assert.ok(source.includes('Alpha 0.17'));
let moduleResult;
vm.runInNewContext(fs.readFileSync('pb_hooks/archive-adapter.js','utf8'), {
    __hooks: '.',require:()=>core,module: {set exports(value){moduleResult=value;}},ForbiddenError: Error
});
assert.throws(()=>moduleResult.owner({get:()=>({id:'other',username:'cadams',role:'Admin'})}),/Owner/);
moduleResult.owner({get:()=>({id:'a9rnjyz6g54spr1'})});
console.log('PASS: backup verification, CSV escaping, active preservation, email failure/retry, changed records, transaction failure/recovery, idempotency, owner auth, frontend syntax.');
