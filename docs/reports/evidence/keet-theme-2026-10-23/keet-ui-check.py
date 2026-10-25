from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out=Path('tmp/real-e2e/keet-theme-20261023');out.mkdir(exist_ok=True);rows=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True);c=b.new_context();pg=c.new_page()
 for app in ['showcase','playground','realtime','benchmark']:
  for theme in ['light','dark']:
   for width in [1440,390]:
    errors=[];failed=[];pg.on('pageerror',lambda e:errors.append(str(e)))
    pg.set_viewport_size({'width':width,'height':1000 if width==1440 else 844});pg.goto(f'http://127.0.0.1:4190/{app}/?theme={theme}');pg.wait_for_selector('.asr-suite');pg.evaluate('document.fonts.ready');pg.wait_for_timeout(180)
    data=pg.evaluate('''()=>({theme:document.documentElement.dataset.theme,width:innerWidth,scroll:document.documentElement.scrollWidth,font:getComputedStyle(document.body).fontFamily,headingFont:getComputedStyle(document.querySelector('h1')).fontFamily,bg:getComputedStyle(document.querySelector('.asr-suite')).backgroundColor,text:getComputedStyle(document.querySelector('.asr-suite')).color,brand:getComputedStyle(document.querySelector('.asr-suite')).getPropertyValue('--demo-brand').trim(),fontLoaded:document.fonts.check('400 16px "Plus Jakarta Sans"'),loadedFonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>({family:f.family,weight:f.weight})),fonts:performance.getEntriesByType('resource').filter(e=>e.name.includes('.woff')).map(e=>e.name)})''')
    data.update(app=app,pageErrors=errors);assert data['fontLoaded'] and 'Plus Jakarta Sans' in data['font'] and data['theme']==theme and data['scroll']==width and not errors,data;rows.append(data);pg.screenshot(path=str(out/f'{app}-{theme}-{width}.png'),full_page=True);pg.screenshot(path=str(out/f'{app}-{theme}-{width}-viewport.png'))
 pg.goto('http://127.0.0.1:4190/showcase/?theme=light');pg.wait_for_selector('.asr-suite');pg.get_by_role('button',name='Switch to dark theme').click();pg.wait_for_function('document.documentElement.dataset.theme==="dark"');pg.goto('http://127.0.0.1:4190/showcase/');pg.reload();pg.wait_for_function('document.documentElement.dataset.theme==="dark"');pg.goto('http://127.0.0.1:4190/benchmark/');pg.wait_for_function('document.documentElement.dataset.theme==="dark"')
 pg.evaluate('''async()=>{await document.fonts.load('400 16px "Plus Jakarta Sans"','Türkçe ığşİĞŞ');await document.fonts.load('400 22px "Crimson Pro"','Türkçe ığşİĞŞ');await document.fonts.load('400 14px "JetBrains Mono"','Türkçe ığşİĞŞ');}''')
 (out/'theme-interaction.json').write_text(json.dumps({'toggle':'VERIFIED','reloadPersistence':'VERIFIED','crossAppNavigationPreference':'VERIFIED','turkishFontSubsets':pg.evaluate('[...document.fonts].filter(f=>f.status==="loaded").map(f=>({family:f.family,weight:f.weight}))')},indent=2),encoding='utf8')
 b.close()
(out/'ui-verification.json').write_text(json.dumps(rows,indent=2),encoding='utf8');print(json.dumps(rows))
