# Ortak model yükleme ve Qwen doğrulaması — 2026-10-24

Dört demonun ana katalog yükleme akışı ortak, kayıtlı model sözleşmesini kullanıyor. Qwen için demo içinde aileye özel yükleme dalı eklenmedi. Kaynak, backend ve precision kararları model descriptor'ından; yerel grafik ve dosya düzeni kütüphanenin kayıtlı adaptöründen geliyor.

## Değişiklikler

- `packages/demo-runtime/src/model-loading.js`: ortak kaynak politikası, kaynak normalleştirme, yerel adaptör incelemesi ve yükleme. UI yalnızca desteklenen kaynakları sunuyor. Boş/uyumsuz klasörler yükleme başlamadan reddediliyor. Local-only modeller Hub pipeline'ına ulaşamıyor.
- Yerel precision seçenekleri, descriptor ile klasörde gerçekten bulunan artifact seçeneklerinin kesişiminden geliyor. Encoder ve decoder backend'leri mevcut kütüphane çözümleyicisiyle seçiliyor ve yerel adaptöre açıkça iletiliyor.
- Showcase ve Live model seçicileri yerel kaynakta da erişilebilir. Klasör seçimi ve model değişiminde precision listeleri yeniden hesaplanıyor. Yanlış “tek ONNX bundle” ve modelden bağımsız gösterilen MedASR açıklamaları kaldırıldı.
- Playground Universal Catalog aynı yükleme katmanını ve public hazır model handle'ını kullanıyor. Kopyalanabilir yerel kod örneği browser local-entry API'sini gösteriyor. Açıkça seçilen Parakeet native/API örnek modları ayrı geliştirici iş akışları olarak korundu.
- Benchmark'ın yinelenen Parakeet/native-session yükleme dalları ortak Hub/local yükleme ve `transcribeMonoPcm` akışına indirildi; mevcut metrik normalleştirmesi korundu.
- Katalog `repoId` alanının doluluğundan değil kayıtlı kaynak yeteneklerinden oluşturuluyor. Bu yüzden Hub destekleyen fakat `repoId` belirtmeyen kayıtlar da doğru listeleniyor.
- Warm-up doğrulaması ortaklaştırıldı. `expected-text` isteyip metin belirtmeyen kayıtlar, kullanılan sabit Harvard ses dosyasının beklenen ifadesiyle doğrulanıyor; rastgele, boş olmayan çıktı yeterli sayılmıyor.
- `multilingual` bir kapsama açıklaması olarak ele alınıyor. Otomatik dil seçiminin UI değeri decoder'a dil etiketi olarak gönderilmiyor. Somut dil kodları korunuyor.

Yeni bir modelin bu akışa eklenmesi kayıtlı descriptor ve uygun kütüphane adaptörü gerektirir. Yeni bir grafik ailesinin yürütme sözleşmesini otomatik tahmin ettiğimiz veya tüm kayıtlı modelleri gerçek ağırlıklarla doğruladığımız iddia edilmiyor. Kütüphanenin public API'si ve root-import sınırı değiştirilmedi.

## Ebeveyn ajan denetimi ve düzeltilen regresyonlar

Alt ajanların değişiklikleri ayrı worktree'lerden dosya bazında alındı; diff'ler, public handle şekli, kaynak geçişleri, yükleme istekleri ve model boşaltma yolları ebeveyn ajan tarafından kontrol edildi. Gerçek tarayıcı koşuları şu ek sorunları ortaya çıkardı ve düzeltildi:

1. Showcase klasör incelemesinde refaktör sonrası kalan tanımsız `encOptions` / `decOptions` değişkenleri.
2. Live model değişiminde kaldırılmış `pickPreferredQuant` import'u.
3. Playground'ın `multilingual` kapsam açıklamasını gerçek dil kodu olarak decoder'a göndermesi.
4. Showcase model değişiminde klasörde bulunmayan precision seçeneklerini descriptor varsayılanlarından yeniden göstermesi.

Başarısız ilk Playground koşusu `evidence/qwen-loading-2026-10-24/playground-before-language-fix.json` içinde korundu. Önceki başarısızlıklar başarılı kabul edilmedi; düzeltme sonrası yeniden çalıştırıldı.

## Gerçek model sonuçları

Model klasörü: `N:/models/onnx/qwen3-asr-0.6b-official`.
Encoder FP32, decoder FP16; dynamic encoder, decoder prefill, decoder step, ortak external-data sidecar ve tokenizer kullanıldı. Beş dosyanın test kopyaları kaynak dosyalarla SHA256 üzerinden karşılaştırıldı; manifest kanıt klasöründe.

Ses: kütüphanedeki 11 saniyelik `jfk2.en.wav`.
SHA256: `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`.
Tam referans, yalnız büyük/küçük harf, noktalama ve boşluk normalleştirilerek karşılaştırıldı. Kısmi metin veya yinelenmiş tam metin kabul edilmiyor.

| Gerçek UI koşusu | Yükleme | Dosya / tek benchmark koşusu | Dosya GPU dispatch | Sonuç |
|---|---:|---:|---:|---|
| showcase-wasm | 31.81 s | 36.27 s | 0 | Tam metin eşleşti |
| showcase-webgpu | 20.58 s | 2.83 s | 64,409 | Tam metin eşleşti |
| realtime-webgpu | 18.98 s | 2.72 s | 64,409 | Tam metin eşleşti |
| playground-webgpu | 17.61 s | 13.59 s | 64,409 | Tam metin eşleşti |
| benchmark-webgpu | 89.41 s | 5.01 s | 64,409 | Tam metin eşleşti |

Tüm tablolu koşular gerçek üretim derlemesi ve Chrome üzerinden yapıldı; model inference'ı mock edilmedi. Benchmark sonucu UI'dan indirilen JSON ile ayrıca kontrol edildi: bir koşu, hata yok, tam transkripsiyon eşleşmesi. Her başarılı koşuda tarayıcı page-error listesi boş.

Süreler tek koşunun gözlemidir; uygulamalar arasında kontrollü performans karşılaştırması değildir. Playground profiling ayarı ve Benchmark'ın derleme/başlatma maliyeti süreleri etkiler. GPU dispatch sayısı gerçek GPU compute çalıştığını doğrular; ORT'nin şekil işlemleri gibi bazı düğümleri CPU'ya ataması nedeniyle tüm grafiğin GPU üzerinde yürüdüğü iddia edilmez.

## Regresyon ve derleme

- `npm test`: **20 Node + 47 Vitest = 67 test geçti**.
- `npm run build`: dört uygulamanın üretim derlemesi geçti. Mevcut bundle boyutu ve service-worker script uyarıları sürüyor.
- `python scripts/e2e/test_qwen_loading_evidence.py`: **4 verifier testi geçti**. Yanlış fixture, eksik load kanıtı, kısmi/tekrarlı metin, tarayıcı hatası ve GPU dispatch kanıtının eksik olması reddediliyor.
- `python scripts/e2e/qwen-source-transitions.py`: dört uygulamada klasör seçimi ve Qwen → Moonshine → Parakeet → Qwen geçişleri geçti; page error yok. Gösterilen yerel precision seçenekleri kontrol edildi.
- `git diff --check`: geçti.

Tekrarlama komutları (demos dizininden, üretim sunucusu 4190 portundayken):

```powershell
python scripts/e2e/qwen-showcase-loading.py --backend wasm
python scripts/e2e/qwen-showcase-loading.py --backend webgpu
python scripts/e2e/qwen-showcase-loading.py --app realtime --backend webgpu
python scripts/e2e/qwen-companion-loading.py --app playground
python scripts/e2e/qwen-companion-loading.py --app benchmark
python scripts/e2e/qwen-source-transitions.py
```

## Sınırlar

Bu kayıt Qwen'in test edilen FP32-encoder/FP16-decoder dosya akışlarını doğrular. Diğer model ağırlıkları, diğer quantization varyantları, fiziksel mikrofon, Qwen VAD/streaming ve modelin genel doğruluk/parity sertifikasyonu **doğrulanmadı**. Diğer üç demonun WASM yollarına ayrıca PASS verilmedi; WASM gerçek model koşusu Showcase'de yapıldı. CI çalıştırılmadı; bu iş için commit/push/merge yapılmadı. Önceden bulunan tema ve TEN-VAD değişiklikleri korundu.

Kanıtlar: [JSON sonuçları, model manifesti, ekran görüntüleri ve test/derleme logları](evidence/qwen-loading-2026-10-24/).
