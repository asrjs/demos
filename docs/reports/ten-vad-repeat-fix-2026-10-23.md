# TEN-VAD-only tekrar düzeltmesi — 2026-10-23

## Sonuç

TEN-VAD-only metin tekrarı, kütüphanenin segment sınırı yönetiminde düzeltildi. Dört demo yeni yerel pakete bağlandı ve production suite yeniden derlendi. Bu çalışma fiziksel mikrofonu, tüm ASR modellerini, geniş corpus doğruluğunu veya CI'ı sertifikalandırmaz.

## Kök neden ve küçük düzeltme

`src/runtime/streaming-detector.ts`:

1. Yeni neural başlangıç ring buffer'ın en eski karesinden aranıyordu. TEN-VAD geçmişi önceki konuşmayı tuttuğu için tamamlanmış konuşmanın aynı başlangıcı tekrar seçilebiliyordu.
2. Onset, VAD'in anlık `speaking` durumu ile açılabiliyor; aktif segment yalnız historical `hasRecentSpeech` ile korunuyordu. Smoothing yeni konuşmayı doğrulamış olsa da geçmişteki sessizlik yeni segmenti hemen sonlandırabiliyordu.

Düzeltme: son finalize edilen mantıksal bitişten önceki neural onset'ler tüketilmiş sayılır; yeni segment için bu sınırın ilerisinde gerçek bir VAD onset'i gerekir. Cursor reddedilmiş segmentlerde de ilerler ve yeni capture başlangıcında sıfırlanır. Aktif neural segment, anlık speaking veya yakın geçmişte konuşma kanıtı varken korunur. VAD geçmişi/reset veya model çıktısı metin deduplication hilesiyle silinmedi. Public API ve model decode kodu değişmedi.

## Regresyon

`tests/streaming-detector-vad-history.test.ts` gerçek TenVadAdapter smoothing/history/query kodunu kullanır; yalnız worker inference olasılıkları deterministik simüle edilir. 16 ms chunk/hop ve mutlak sample frame'leri eşleşir.

- accepted, rejected, manual ve max-duration × vad-only/hybrid = 8 senaryo.
- Sonraki gerçek konuşmanın önceki onset'e dönmemesi, kuyruk/segment sayıları ve logical frame ilerlemesi kontrol edilir.
- accepted senaryoları aynı detector'da stop/start sonrası yeni frame origin'ini de kontrol eder.
- Manual flush sonrası smoother'ın kısa konuşma kuyruğu yeni ses olarak gelebilir; önceki logical aralık yeniden açılamaz. Max-duration'ın mevcut sınır-chunk overlap sözleşmesi korunur.
- İlk altı test eski kaynakta FAIL, düzeltmede PASS olarak kaydedildi. İncelemeden sonra max-duration ve restart sınırları eklenerek son sekiz test de geçti.

İlk test taslağı foregroundFilterEnabled=false değerinin bütün segmentleri reddettiğini gösterdi; gerçek energy-filter API'si okunduktan sonra testin önkoşulu düzeltildi. İlk cursor-only aday, aktif VAD/sessizlik çelişkisini çözmediği için geri alındı. Bir sözdizimi adayı da küçük test kapısında yakalanıp geri alındı. Bunlar başarı kanıtı sayılmadı.

## Gerçek model E2E

Chrome 155, Windows; yerel Parakeet TDT v3 fp16 encoder + fp32 decoder; gerçek TEN-VAD WASM worker. Fake microphone dosyası: 1 s sessizlik + orijinal 11 s JFK + 5 s sessizlik. Capture PCM'i değiştirilmez; gerçek UI, capture, detector, worker ve model inference zinciri kullanılır. Fikstür SHA256: `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`.

| Çalıştırma | Sonuç | Segment / queue | Metin |
| --- | --- | --- | --- |
| before-fix-verified / eski exact12 paketi / TEN-only | FAIL | 61 segment-ready, 47 enqueue/completed; neural başlangıç 21248'e tekrar dönüyor | And And ...; tam oracle eşleşmiyor |
| after-fix / yeni paket / TEN-only | PASS_CONTROLLED_FIXTURE | 4 segment, 4 enqueue, 4 completion; monotonic onset/finalized frame'ler | Tam normalize oracle eşleşiyor |
| after-fix-control / yeni paket / Rough-only | PASS_CONTROLLED_FIXTURE | 4 segment, 4 enqueue, 4 completion | Tam normalize oracle eşleşiyor |

Yeni TEN-only onset'ler: 22016, 70144, 104192, 148736. Finalize logical end'ler: 56320, 89344, 140032, 194304. Extraction'daki küçük overlap mevcut 80 ms sözleşmesidir; aynı eski konuşmanın yeniden açılması değildir. Page error yok; TEN-only effective gate ve TEN-VAD ready kanıtı var.

E2E doğrulayıcı kısmi/çoğaltılmış metni, yanlış fikstürü, eksik kuyruk tamamlanmasını, rough fallback'i ve eski frame'e dönen onset'i reddeder. Dört Python doğrulayıcı unit testi geçti. İlk ölçüm taslağı MicQueue'nun console.log yerine console.debug kullandığını kaçırdığı için FAIL/timeout kaydı üretti; bu hatalı ölçüm başarı sayılmadı, ayrı makbuz olarak korundu. Başarısız baseline yeni doğrulayıcıyla tekrar alındı.

## Diğer doğrulama

- Library: 1867 passed, 36 skipped (221 test dosyası passed, 7 skipped).
- Typecheck başarılı; lint 0 error, mevcut 13 warning.
- Demo: 14 Node + 45 Vitest başarılı; dört production build başarılı.
- Root static import graph: 44; 45'in altında, sınır gevşetilmedi.
- Kütüphane dist detector ve demoya kurulu detector SHA256 aynı: `d748e03def30d49196c0d7912c47fbf1bcfcca2ac64535ea4b4e293e26c8c45a`.
- Salt okunur alt ajan incelemesi sonucu parent tarafından kaynak/test/makbuzlarla denetlendi. Onay, gerçek-model testi yerine kullanılmadı.

## Paket ve yeniden çalıştırma

Yeni arşiv: `vendor/asrjs-speech-recognition-0.2.0-ten-vad-20261023.tgz`.
Base library HEAD `e534fb517dcd15a52ac8b52bff85551df89d3673` + bu yerel detector patch'i.
Arşiv SHA256 `c26d5a3b44a5dbf5ac83b24ed031aeca2e7ae8caa6556eb89c6bcd82eb25533e`.
Dört app package.json ve lockfile güncellendi. Eski tarball'lar geri alma için korundu; Keet tema değişiklikleri korunur.

Demo suite server 4190 çalışırken, demos kökünde:

```powershell
C:\Python311\python.exe -m unittest discover -s scripts/e2e -p test_realtime_ten_vad_regression.py
C:\Python311\python.exe scripts/e2e/realtime-ten-vad-regression.py --phase rerun
C:\Python311\python.exe scripts/e2e/realtime-ten-vad-regression.py --phase rough-control --gate rough-only
```

Kanıtlar: [evidence/ten-vad-repeat-fix-2026-10-23](evidence/ten-vad-repeat-fix-2026-10-23/). `manifest.json` kaynak, test, kurulu detector ve tarball hash'lerini içerir. Fiziksel mikrofon UNVERIFIED. Bu yerel değişiklikler için CI çalıştırılmadı; push/merge veya yayın yapıldığı iddia edilmez.
