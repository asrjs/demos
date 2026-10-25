# Model, demo ve streaming denetimi — 2026-10-23

EOU120 kapsam dışı. Bu rapor tema değişikliğinden **önceki** demo görüntüsünü ve bu oturumda bizzat çalıştırılan modelleri kaydeder. Kodda kayıtlı olmak, gerçek modelin başarılı çalışması değildir.

## Taze gerçek-model sonuçları

Kütüphane kaynak HEAD: e534fb517dcd15a52ac8b52bff85551df89d3673. Chrome 155; Windows. Dört deneysel aile public `loadSpeechModel` + doğrudan yerel artifact URL'leriyle, Qwen ve Moonshine public local-entry loader ile çalıştırıldı. WebGPU istenen çalıştırmalarda ORT CPU yerleşimi uyarıları da verdi; tüm grafiğin GPU'da çalıştığı iddia edilmiyor. Tek GPU işi sırayla yürütüldü.

| Model / artifact | Doğrulanan kapsam | Sonuç |
| --- | --- | --- |
| GigaAM multilingual CTC | 11 s JFK; WebGPU isteği; load 7.78 s, offline 2.07 s | Tam normalize metin eşleşti; native streaming yok |
| SenseVoice Small | 11 s JFK; WebGPU isteği; load 8.35 s, offline 1.93 s | Tam normalize metin eşleşti; native streaming yok |
| GigaAM v3 e2e RNN-T | Resmi Rusça example.wav, 11.29 s; load 7.79 s, offline 3.53 s | Resmi engine referansıyla tam normalize metin eşleşti; native streaming yok |
| X-ASR zh-en 160 ms | JFK offline ve 160 ms parçalardan stateful streaming | İki final metin de eşleşti; ara metinler geldi. Offline 17.33 s, streaming toplam 10.08 s. İlk ara metin 1.12 s ses işlendiğinde geldi; bu duvar saati gecikmesi değildir |
| Qwen3-ASR 0.6B official FP16 | Browser File nesnelerinden WASM local-entry yükleme, 11 s JFK | Tam normalize metin eşleşti; inference 43.76 s. Bu ayar realtime hızında değil; native streaming yok |
| Moonshine Tiny FP32 | WASM offline; cold ve aynı handle warm tekrar | İkisinde oracle eşleşti; 1.22 / 1.14 s; native streaming yok |
| Yerel moonshine-streaming-tiny-fp32 klasörü | WASM offline + streaming isteği | FAIL: offline tekrar eden I çıktısı; streaming desteklenmiyor hatası. Klasörde gerekli encoder_chunked/prefill/step graph seti yok. Bu artifact setiyle streaming PASS değil; tüm Moonshine uygulamasının bozuk olduğu anlamına gelmez |

JFK fixture SHA256: `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`. Rusça fixture SHA256: `d8aaaa18a5098d7c6de0595ae7ac1e64cacd0d4022af3595213bdaf23be77e69`.

Bu küçük fixture testleri dil kapsamı, corpus WER, gürültü dayanımı, uzun kayıt doğruluğu, timestamp/alignment doğruluğu veya upstream sayısal parity belgesi değildir. Nemotron, Canary, Whisper, Türkçe Wav2Vec2, Omnilingual ve kalan preset/backend/precision kombinasyonları bu oturumda tekrar çalıştırılmadı; yeni PASS yok. Moonshine kelime zamanları eşit aralıklı yaklaşık değerlerdir, forced alignment olarak sunulmamalı.

## Demo entegrasyonu

Dört demo package-mode arşivi `af8d147a...` + v3 BDT düzeltmesine bağlı; güncel kütüphane HEAD'ini tüketmiyor. Ortak `packages/demo-runtime/src/model-catalog.js`, preset listesini kullanıyor. Deneysel GigaAM CTC/RNN-T, SenseVoice, X-ASR ve qwen-asr ailesinin ayrı artifact seçenekleri bu listede yok. Eski Qwen3 preset'i mevcut; bunun deneysel family listesiyle karıştırılmaması gerekir. Local browser adapter registry'de GigaAM/SenseVoice/X-ASR adapter'leri de yok. Library API başarısı dört demo üzerinden bu modelleri yükleyebildiğimiz anlamına gelmiyor. Playground'un all families açıklaması mevcut seçim/yükleme kapsamını abartıyor.

## Gerçek kontrollü mikrofon / VAD

Gerçek Parakeet v3 fp16 encoder/fp32 decoder, Chrome fake microphone; 1 s sessizlik + 11 s JFK + 5 s sessizlik. PCM değiştirilmedi; worker mesajları yalnızca gözlendi. Fiziksel mikrofon UNVERIFIED.

- Speech Detect + rough-only: dört tamamlanmış segment; joined transcript normalize oracle ile eşleşiyor. FireRed model yüklendi fakat diagnostics-only; bu test neural VAD segmentasyonu kanıtı değil.
- Speech Detect + TEN-VAD + vad-only: **FAIL kalite/regresyon**. 39 worker isteğine ek olarak ilk main-thread istekleri var; birçok örtüşen segment aynı baştan tekrar gönderiliyor. Ekran metni And And And ... biçiminde çoğalıyor. TEN-VAD gerçekten hazır; sessizlik/süre sonlandırma olayları gözleniyor. Tek oturumdaki kayıt hata kanıtıdır; kesin kök neden henüz regresyon testiyle izole edilmedi.
- Realtime demo controller'a `streamingTranscriber` sağlamıyor; finalize edilmiş PCM parçalarını `transcribeMonoPcm` kuyruğuna veriyor. Yani mevcut demo akışı utterance transcription. Library controller stateful model streaming bağlamayı destekliyor; X-ASR model tarafı ayrıca yukarıda doğrulandı. X-ASR + neural VAD + fiziksel mikrofon bileşimi doğrulanmadı.
- Salt demo paketini güncellemek TEN-VAD tekrar hatasını düzeltti diye kabul edilemez; mevcut main'de de aynı ilgili mantık var.

## Standartlaşma ve kalite

59 demo testi ve dört production build başarılı. Dört app'i Chrome'da 1440 px desktop ve 390 px mobilde açtım: başlangıç pageerror yok, yatay document taşması yok. Light/dark, aynı köken içinde preference persistence çalışıyor. Bu testler gerçek model yükleme veya benchmark kalite sertifikası değil.

Tema/shell ve katalog parçaları ortak; fakat model loader seçenekleri ve ayar saklama akışları ayrışmış. Showcase dosya transkripsiyonu, Playground API denemesi, Realtime yakalama ve Benchmark ölçüm görevleri ayrı tutulabilir. 67 source/asset içinde iki birebir aynı dosya çifti bulundu (ince loader wrapper ve Harvard OGG); esas tekrar orchestration ve seçenek çözümleme. Dışarıdaki eski demo klasörleri var, aktif dağıtımları bu denetimde saptanmadı.

Önceki tasarımın renk/fontları kullanıcı tarafından reddedildi; tema yeniden Keet'ten taşınacak. Playground mobil ekranı yaklaşık 6227 px, Realtime 7354 px: debug kontrol yoğunluğu ana görevi gölgeliyor. Showcase'de görünür label öğeleri select/input ile htmlFor/id üzerinden bağlı değil; tarayıcıda 10 model kontrolü ve reference textarea için erişilebilir ad bağlantısı bulunamadı. Tam screen-reader sertifikası yok.

## Öncelik

1. Kullanıcının son talebi: yerel ysdede/keet font, palette ve bileşen stillerini ortak demo UI katmanına taşı; dört uygulamada light/dark ve mobil kontrol et.
2. TEN-VAD örtüşen segment regresyonunu deterministik testle izole et, küçük düzelt ve aynı gerçek-model senaryosunu tekrar çalıştır.
3. Güncel kütüphane artifact'ini demolarla eşitle; yeni aileler için ortak model/artifact/capability tanımı ve local adapter ekle.
4. Realtime'a gerçek stateful streaming bağla; segment metni ile preview/final transcript'ı ayrı yaşam döngülerinde tut.
5. Model başına çok dilli fixture + uzun/sessiz/gürültülü ses matrisi; doğrulanmayan kombinasyonlar UNVERIFIED kalmalı.

## Kanıtlar ve yeniden çalıştırma

JSON/log/script/görüntüler: [evidence/model-demo-audit-2026-10-23](evidence/model-demo-audit-2026-10-23/). Test scriptleri tarihli tmp klasörlerinden çalıştırılmıştır; kopyalanan scriptlerin output path'leri aynı çalışma kökünü varsayar. `run-public.py` için library harness 8999; demo scriptleri için production suite 4190 gerekir. Qwen scripti tools/browser-harness/qwen-file-input-smoke.py'dir. Moonshine FAIL makbuzu ve logu korunmuştur. Rapor kaynak kod değişikliği veya CI PASS iddiası içermez.
