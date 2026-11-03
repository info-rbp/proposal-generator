import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RichText} from '../src/ProposalSite';
import {blankDocument} from '../shared/templates';
import {defaultWebsite,makeSnapshot} from '../shared/website';
test('safe Markdown advances on empty heading markers and escapes scripts',()=>{const html=renderToStaticMarkup(createElement(RichText,{text:'# \n## \n<script>alert(1)</script>\n\n**Emphasis**\n- One\n- Two'}));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('<strong>Emphasis</strong>'));assert.ok(html.includes('<li>One</li>'))});
test('whole-document PDF cannot bypass hidden optional website sections',()=>{const d=blankDocument('proposal');d.sections.push({id:crypto.randomUUID(),title:'Not for publication',body:'Internal optional content',required:false});const site=defaultWebsite(d);site.tabs.find(t=>t.kind==='sections')!.sectionIds=[d.sections[0].id];assert.equal(makeSnapshot(d,site,[],1,undefined,true).hasPdf,false)});
