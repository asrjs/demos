import json,pathlib
from playwright.sync_api import sync_playwright
out=pathlib.Path('tmp/real-e2e/audit-20261023');rows=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
 c=b.new_context(viewport={'width':390,'height':844});pg=c.new_page()
 for app in ['showcase','playground','realtime','benchmark']:
  pg.goto('http://127.0.0.1:4190/'+app+'/?theme=dark');pg.wait_for_selector('.asr-suite');pg.wait_for_timeout(300)
  row={'app':app,'dark':pg.evaluate('({theme:document.documentElement.dataset.theme,bg:getComputedStyle(document.body).backgroundColor,width:innerWidth,scroll:document.documentElement.scrollWidth})')}
  pg.screenshot(path=str(out/(app+'-dark-mobile.png')),full_page=True)
  pg.goto('http://127.0.0.1:4190/'+app+'/');pg.wait_for_selector('.asr-suite');row['persistedWithoutQuery']=pg.evaluate('document.documentElement.dataset.theme');row['unnamedControls']=pg.locator('input,select,textarea').evaluate_all('els=>els.filter(e=>!e.disabled&&e.type!=="hidden"&&!e.labels?.length&&!e.getAttribute("aria-label")&&!e.getAttribute("aria-labelledby")).map(e=>({tag:e.tagName,type:e.type,id:e.id,value:e.value}))');rows.append(row)
 b.close()
(out/'theme-and-labels.json').write_text(json.dumps(rows,indent=2),encoding='utf8');print(json.dumps(rows))
