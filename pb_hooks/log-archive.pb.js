// PocketBase 0.19.2. No administrator credentials or SMTP passwords in the frontend.
routerAdd('GET', '/api/cacs/log-archives', (c) => {
    const api = require(__hooks + '/archive-adapter.js');
    api.owner(c);
    return c.json(200, api.list());
}, $apis.requireRecordAuth('users'));

routerAdd('POST', '/api/cacs/log-archives/prepare', (c) => {
    const api = require(__hooks + '/archive-adapter.js');
    api.owner(c);
    return c.json(200, api.locked(() => api.prepare()));
}, $apis.requireRecordAuth('users'));

routerAdd('POST', '/api/cacs/log-archives/:id/finish', (c) => {
    const api = require(__hooks + '/archive-adapter.js');
    api.owner(c);
    const data = new DynamicModel({confirmation: ''});
    c.bind(data);
    if (data.confirmation !== 'EMAIL_AND_CLEAR_COMPLETED_LOGS') throw new BadRequestError('Confirmation required.');
    return c.json(200, api.locked(() => api.finish(c.pathParam('id'))));
}, $apis.requireRecordAuth('users'));

routerAdd('GET', '/api/cacs/log-archives/:id/:format', (c) => {
    const api = require(__hooks + '/archive-adapter.js');
    api.owner(c);
    return api.download(c, c.pathParam('id'), c.pathParam('format'));
}, $apis.requireRecordAuth('users'));
