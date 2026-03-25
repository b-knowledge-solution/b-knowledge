# QA_EVALUATION_GUIDE — Đánh giá RAG từ A đến Z

> **Loại**: End-to-end Guide | **Đối tượng**: QA | **Phases**: 2 → 4 | **Cập nhật**: March 25, 2026

## Mục đích
Hướng dẫn đầy đủ cho QA thực hiện toàn bộ chu trình đánh giá RAG:  
từ **chọn tài liệu** → **tạo Q&A** → **chạy evaluation** → **đọc kết quả báo cáo**.

> ⚠️ **Khác với PHASE2_DATASET_PREP_GUIDE**: Guide đó chỉ tập trung Phase 2 (chuẩn bị data).  
> Guide này bao phủ **toàn bộ** từ Phase 2 → Phase 4 với giải thích chi tiết hơn.

## ✅ Evaluation Done khi...
- [ ] `make eval` chạy thành công với 80-100 Q&A pairs
- [ ] `evaluations/rag/results/report.html` tồn tại và mở được
- [ ] Điểm tổng thể ≥ 70% (threshold tối thiểu)
- [ ] Đã ghi nhận top 5 câu sai và nguyên nhân

---

## Tiên quyết

> Cần hoàn thành Phase 2 trước. Làm theo **[PHASE2_DATASET_PREP_GUIDE.md](PHASE2_DATASET_PREP_GUIDE.md)** để có `dataset/eval_dataset.yaml` sẵn sàng.

---

## Chạy Evaluation

**Câu hỏi:** Hệ thống trả lời đúng bao nhiêu %?

**Làm gì:**

1. **Chạy test** (tự động, không cần làm gì)
   ```bash
   make eval
   ```
   Hệ thống sẽ tự động:
   - Hỏi tất cả 80-100 câu
   - Kiểm tra từng đáp án
   - Ghi điểm số
   - Lưu kết quả

2. **Xem báo cáo** (file HTML)
   ```
   Mở file: evaluations/rag/results/report.html
   ```

3. **Phân tích kết quả**
   ```
   Kết quả sẽ hiển thị:
   
   Điểm tổng: 82/100 (82%)
   
   Theo loại:
   - Factual questions: 95% (19/20)
   - Process questions: 78% (28/36)  ← Cần cải thiện
   - Technical questions: 75% (15/20) ← Cần cải thiện
   - Troubleshoot: 82% (10/12)
   
   Theo độ khó:
   - Easy: 98% 
   - Medium: 78%
   - Hard: 65%
   ```

4. **Ghi nhận những câu sai**
   ```
   Ví dụ: "Làm sao để configure XYZ?"
   - Hệ thống trả: "Vào Settings > Config"
   - Đáp án đúng: "Vào Settings > Admin > Config > Advanced Settings"
   - Kết luận: Hệ thống thiếu chi tiết
   ```

---

## 🔍 Chi Tiết Từng Bước Evaluation

### Khi Chạy `make eval`, Hệ Thống Làm Gì?

```
Hệ thống sẽ:
1. Đọc 80-100 câu hỏi từ list
2. Gửi từng câu hỏi tới B-Knowledge
3. Nhận câu trả lời từ B-Knowledge
4. So sánh đáp án:
   - Có chứa thông tin đúng không?
   - Có đủ chi tiết không?
   - Có trích dẫn nguồn không?
5. Ghi điểm cho mỗi câu (0-100%)
6. Tính trung bình điểm
7. Tạo báo cáo chi tiết
```

### Báo Cáo Gồm Những Gì?

```
📊 report.html sẽ chứa:

1. TÓM LƯỢC (Summary)
   - Tổng điểm: 82%
   - Số câu đúng/sai: 82/100

2. PHÂN TÍCH THEO LOẠI
   - Factual: 95%
   - Process: 78%
   - Technical: 75%
   - Troubleshoot: 82%

3. PHÂN TÍCH THEO ĐỘ KHÓ
   - Easy: 98%
   - Medium: 78%
   - Hard: 65%

4. CHI TIẾT TỪNG CÂU
   - Q: Câu hỏi
   - Đáp án dự kiến: Câu trả lời đúng
   - Đáp án thực tế: Hệ thống trả
   - Điểm: 85%
   - Lý do: (Hệ thống thiếu 1 bước)

5. KHUYẾN NGHỊ
   - Nên cải thiện những câu nào?
   - Nên sửa tài liệu ở đâu?
```

---

## 📊 Ví Dụ Báo Cáo Thực

```
==================================================
    RAG EVALUATION REPORT
==================================================

Overall Score: 82% (82/100 questions correct)

By Category:
├─ Factual Q: 95% ✓ Tốt
├─ Process Q: 78% ⚠️ Cần cải thiện
├─ Technical Q: 75% ⚠️ Cần cải thiện
└─ Troubleshoot: 82% ✓ Tốt

By Difficulty:
├─ Easy: 98% ✓
├─ Medium: 78% ⚠️
└─ Hard: 65% ⚠️

TOP 5 FAILED QUESTIONS:
1. Q: "Làm sao configure advanced settings?"
   Expected: "Vào Settings > Admin > config.json..."
   Got: "Vào Settings > Config"
   Score: 45% (Thiếu chi tiết)

2. Q: "Khác nhau giữa Plan A và Plan B?"
   Expected: "Plan A có X, Plan B có Y"
   Got: "Không tìm thấy thông tin"
   Score: 0% (Không có trong docs)
   
3. ... (3 cái khác)

RECOMMENDATIONS:
→ Thêm tài liệu về "Advanced Configuration"
→ Cập nhật "Plan Comparison" section
→ Sửa lại phần "Process" trong docs
```

---

## 📝 Tóm Tắt Toàn Chu Trình

| Giai đoạn | Việc Cần Làm | Guide | Output |
|-----------|-------------|-------|--------|
| Phase 2 | Chuẩn bị docs, tạo Q&A, gắn category/difficulty | [PHASE2_DATASET_PREP_GUIDE.md](PHASE2_DATASET_PREP_GUIDE.md) | `eval_dataset.yaml` |
| **Phase 4** | **Chạy evaluation, đọc report, ghi nhận kết quả** | **File này** | `results/report.html` |

---

## ✅ Checklist Chuẩn Bị

Trước khi bắt đầu, chắc chắn:

- [ ] Có access vào B-Knowledge? (xem tài liệu có upload)
- [ ] Có access vào Easy Dataset UI tại `http://localhost:1717`?
- [ ] Hiểu rõ những tài liệu nào sẽ test?
- [ ] Máy tính ổn định, kết nối internet tốt?

---

## 🚀 Bắt đầu từ đâu?

1. Đọc [PHASE2_FIXTURE_REFERENCE.md](PHASE2_FIXTURE_REFERENCE.md) để hiểu cấu trúc dataset
2. Làm theo [PHASE2_DATASET_PREP_GUIDE.md](PHASE2_DATASET_PREP_GUIDE.md) từng bước
3. Sau khi có `eval_dataset.yaml` → quay lại đây, thực hiện BƯỚC 4
