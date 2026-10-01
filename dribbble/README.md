# Dribbble popularity analysis

```bash
pip install -r requirements.txt
python scrape.py /shots/popular /shots/popular/web-design --pages 5 --details
python analyze.py --top 20
python -m pytest
```

- `scrape.py`: patuh robots.txt, delay 3 dtk, cache di `cache/`, berhenti jika kena 403/429.
- `parse.py`: semua CSS selector ada di `SELECTORS`. **Belum diverifikasi terhadap situs live** — jika hasil kosong, buka HTML di `cache/` dan sesuaikan selector.
- `analyze.py`: tag/desainer terpopuler (likes + 2×saves, engagement rate) dan proksi sinyal klien.

## Batasan
- Data klien/inquiry/hire **tidak publik**. Yang dianalisis hanya proksi: desainer Pro/Team, badge "available for work", dan tag yang over-represented di antara mereka. Itu korelasi, bukan bukti dapat klien.
- Syarat layanan Dribbble membatasi scraping otomatis. Pakai untuk riset pribadi skala kecil, atau pertimbangkan Dribbble API resmi (OAuth).
