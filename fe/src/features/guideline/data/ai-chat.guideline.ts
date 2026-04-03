/**
 * @fileoverview AI Chat feature guideline data.
 * @description Defines the step-by-step user guide for the AI Chat feature.
 * @module features/guideline/data/ai-chat.guideline
 */
import { IFeatureGuideline } from './types';

/** @description Guideline configuration for the AI Chat feature */
export const aiChatGuideline: IFeatureGuideline = {
    featureId: 'ai-chat',
    roleRequired: 'user',
    overview: {
        en: 'Learn how to use the AI Chat assistant for your daily tasks. Select specialized agents, use prompt templates, and manage your conversation history effectively.',
        vi: 'Tìm hiểu cách sử dụng trợ lý AI Chat cho các công việc hàng ngày của bạn. Chọn các tác nhân chuyên biệt, sử dụng mẫu gợi ý và quản lý lịch sử trò chuyện hiệu quả.',
        ja: '日々のタスクにAIチャットアシスタントを活用する方法を学びます。専門のエージェントを選択し、プロンプトテンプレートを使用し、会話履歴を効果的に管理します。'
    },
    tabs: [
        {
            tabId: 'basicChatting',
            tabTitle: { en: 'Basic Chatting', vi: 'Trò Chuyện Cơ Bản', ja: '基本チャット' },
            steps: [
                {
                    id: 'step1',
                    title: { en: 'Send a Message', vi: 'Gửi Tin Nhắn', ja: 'メッセージを送信' },
                    description: {
                        en: 'Start a conversation with the AI.',
                        vi: 'Bắt đầu cuộc trò chuyện với AI.',
                        ja: 'AIとの会話を開始します。'
                    },
                    details: {
                        en: [
                            '1. Type your question or command in the input box at the bottom.',
                            '2. Press Enter or click the "Send" icon (paper plane).',
                            '3. Wait for the AI to process and stream the response.'
                        ],
                        vi: [
                            '1. Nhập câu hỏi hoặc lệnh của bạn vào ô nhập liệu ở dưới cùng.',
                            '2. Nhấn Enter hoặc nhấp vào biểu tượng "Gửi" (máy bay giấy).',
                            '3. Đợi AI xử lý và truyền phát câu trả lời.'
                        ],
                        ja: [
                            '1. 下部の入力ボックスに質問またはコマンドを入力します。',
                            '2. Enterキーを押すか、「送信」アイコン（紙飛行機）をクリックします。',
                            '3. AIが処理して応答をストリーミングするのを待ちます。'
                        ]
                    }
                },
                {
                    id: 'step2',
                    title: { en: 'View Citations', vi: 'Xem Trích Dẫn', ja: '引用を表示' },
                    description: {
                        en: 'Hover over citation tags to see the source content.',
                        vi: 'Di chuột qua các thẻ trích dẫn để xem nội dung nguồn.',
                        ja: '引用タグにマウスを合わせると、ソースコンテンツが表示されます。'
                    },
                    details: {
                        en: [
                            '1. Locate citation tags like `<Fig. X>` within the AI response.',
                            '2. Hover your mouse over the tag to see a popup with the source text.',
                            '3. The popup shows the specific chunk retrieved from the Knowledge Base.'
                        ],
                        vi: [
                            '1. Tìm các thẻ trích dẫn như `<Fig. X>` trong câu trả lời của AI.',
                            '2. Di chuột qua thẻ để thấy cửa sổ hiện lên chứa nội dung nguồn.',
                            '3. Cửa sổ này hiển thị đoạn trích cụ thể được lấy từ Cơ sở Tri thức.'
                        ],
                        ja: [
                            '1. AIの回答内にある `<Fig. X>` などの引用タグを探します。',
                            '2. タグにマウスを合わせると、ソーステキストを含むポップアップが表示されます。',
                            '3. ポップアップには、ナレッジベースから取得された特定のチャンクが表示されます。'
                        ]
                    }
                },
                {
                    id: 'step3',
                    title: { en: 'Open Source Document', vi: 'Mở Tài Liệu Nguồn', ja: 'ソースドキュメントを開く' },
                    description: {
                        en: 'Access the full document for complete context.',
                        vi: 'Truy cập tài liệu đầy đủ để biết toàn bộ bối cảnh.',
                        ja: '完全なコンテキストを確認するために、ドキュメント全体にアクセスします。'
                    },
                    details: {
                        en: [
                            '1. While viewing the citation popup, look at the bottom area.',
                            '2. Click on the file name (e.g., "Master RAG.pdf").',
                            '3. The "Document Previewer" will open, displaying the full file.'
                        ],
                        vi: [
                            '1. Trong khi xem cửa sổ trích dẫn, hãy nhìn vào khu vực phía dưới.',
                            '2. Nhấp vào tên tệp (ví dụ: "Master RAG.pdf").',
                            '3. "Trình xem Tài liệu" sẽ mở ra, hiển thị toàn bộ tệp.'
                        ],
                        ja: [
                            '1. 引用ポップアップを表示している間、下部のエリアを確認します。',
                            '2. ファイル名（例：「Master RAG.pdf」）をクリックします。',
                            '3. 「ドキュメントプレビュー」が開き、ファイル全体が表示されます。'
                        ]
                    }
                }
            ]
        },
        {
            tabId: 'agentSelection',
            tabTitle: { en: 'Agent Selection', vi: 'Chọn Trợ Lý', ja: 'エージェント選択' },
            steps: [
                {
                    id: 'step1',
                    title: { en: 'Select an Agent', vi: 'Chọn một Trợ lý', ja: 'エージェントを選択' },
                    description: {
                        en: 'Choose from a list of specialized agents tailored for different tasks.',
                        vi: 'Chọn từ danh sách các trợ lý chuyên biệt được thiết kế cho các nhiệm vụ khác nhau.',
                        ja: 'さまざまなタスクに合わせて調整された専門エージェントのリストから選択します。'
                    },
                    details: {
                        en: [
                            '1. Click on the Agent Selector dropdown in the top header.',
                            '2. Browse the list of available agents (e.g., General Assistant, Code Expert).',
                            '3. Select the agent that best fits your current task.'
                        ],
                        vi: [
                            '1. Nhấp vào danh sách thả xuống Chọn Trợ lý ở tiêu đề trên cùng.',
                            '2. Duyệt qua danh sách các trợ lý có sẵn (ví dụ: Trợ lý chung, Chuyên gia mã).',
                            '3. Chọn trợ lý phù hợp nhất với nhiệm vụ hiện tại của bạn.'
                        ],
                        ja: [
                            '1. トップヘッダーのエージェント選択ドロップダウンをクリックします。',
                            '2. 利用可能なエージェントのリストを参照します（例：一般アシスタント、コードエキスパート）。',
                            '3. 現在のタスクに最適なエージェントを選択します。'
                        ]
                    }
                }
            ]
        },
        {
            tabId: 'promptLibrary',
            tabTitle: { en: 'Prompt Library', vi: 'Thư Viện Gợi Ý', ja: 'プロンプトライブラリ' },
            steps: [
                {
                    id: 'step1',
                    title: { en: 'Use Templates', vi: 'Sử dụng Mẫu', ja: 'テンプレートを使用' },
                    description: {
                        en: 'Access pre-defined prompts to get better results quickly.',
                        vi: 'Truy cập các gợi ý được định nghĩa trước để có kết quả tốt hơn nhanh chóng.',
                        ja: '事前に定義されたプロンプトにアクセスして、より良い結果を迅速に得ることができます。'
                    },
                    details: {
                        en: [
                            '1. Click the "Prompt Library" icon near the chat input.',
                            '2. Search or browse for a relevant prompt template.',
                            '3. Click on a template to insert it into your message box.',
                            '4. Modify the template variables as needed before sending.'
                        ],
                        vi: [
                            '1. Nhấp vào biểu tượng "Thư viện gợi ý" gần khung nhập chat.',
                            '2. Tìm kiếm hoặc duyệt qua các mẫu gợi ý liên quan.',
                            '3. Nhấp vào một mẫu để chèn nó vào hộp tin nhắn của bạn.',
                            '4. Sửa đổi các biến mẫu nếu cần trước khi gửi.'
                        ],
                        ja: [
                            '1. チャット入力近くの「プロンプトライブラリ」アイコンをクリックします。',
                            '2. 関連するプロンプトテンプレートを検索または参照します。',
                            '3. テンプレートをクリックしてメッセージボックスに挿入します。',
                            '4. 送信する前に、必要に応じてテンプレート変数を変更します。'
                        ]
                    }
                }
            ]
        },
        {
            tabId: 'responseFeedback',
            tabTitle: { en: 'Feedback', vi: 'Phản Hồi', ja: 'フィードバック' },
            steps: [
                {
                    id: 'step1',
                    title: { en: 'Rate Response', vi: 'Đánh Giá', ja: '回答を評価' },
                    description: {
                        en: 'Rate the quality of the AI response.',
                        vi: 'Đánh giá chất lượng câu trả lời của AI.',
                        ja: 'AIの回答の品質を評価します。'
                    },
                    details: {
                        en: [
                            '1. Hover over an AI message to see the action buttons.',
                            '2. Click the "Like" (Thumbs Up) icon if the answer was helpful.',
                            '3. Click the "Dislike" (Thumbs Down) icon if the answer was incorrect or poor.'
                        ],
                        vi: [
                            '1. Di chuột qua tin nhắn của AI để xem các nút hành động.',
                            '2. Nhấp vào biểu tượng "Thích" (Ngón tay cái lên) nếu câu trả lời hữu ích.',
                            '3. Nhấp vào biểu tượng "Không thích" (Ngón tay cái xuống) nếu câu trả lời sai hoặc kém.'
                        ],
                        ja: [
                            '1. AIメッセージにマウスを合わせると、アクションボタンが表示されます。',
                            '2. 回答が役に立った場合は、「いいね」（親指を上げる）アイコンをクリックします。',
                            '3. 回答が間違っていたり不十分だったりした場合は、「よくないね」（親指を下げる）アイコンをクリックします。'
                        ]
                    }
                },
                {
                    id: 'step2',
                    title: { en: 'Submit Comment', vi: 'Gửi Nhận Xét', ja: 'コメントを送信' },
                    description: {
                        en: 'Provide details when disliking a response.',
                        vi: 'Cung cấp chi tiết khi không thích câu trả lời.',
                        ja: '回答が気に入らない場合に詳細を提供します。'
                    },
                    details: {
                        en: [
                            '1. When you click "Dislike", a feedback dialog will appear.',
                            '2. Explain why the response was not satisfactory (e.g., Inaccurate, Harmful).',
                            '3. Click "Submit" to send your feedback to the development team.'
                        ],
                        vi: [
                            '1. Khi bạn nhấp vào "Không thích", hộp thoại phản hồi sẽ xuất hiện.',
                            '2. Giải thích lý do tại sao câu trả lời không thỏa đáng (ví dụ: Không chính xác, Có hại).',
                            '3. Nhấp vào "Gửi" để gửi phản hồi của bạn đến nhóm phát triển.'
                        ],
                        ja: [
                            '1. 「よくないね」をクリックすると、フィードバックダイアログが表示されます。',
                            '2. 回答が不十分であった理由（例：不正確、有害）を説明します。',
                            '3. 「送信」をクリックして、フィードバックを開発チームに送信します。'
                        ]
                    }
                }
            ]
        },
        {
            tabId: 'actionBar',
            tabTitle: { en: 'Action Bar', vi: 'Thanh Thao Tác', ja: 'アクションバー' },
            steps: [
                {
                    id: 'step1',
                    title: { en: 'Chat Controls', vi: 'Điều khiển Chat', ja: 'チャットコントロール' },
                    description: {
                        en: 'Zoom, reset session, or clear history using the action bar.',
                        vi: 'Phóng to, đặt lại phiên hoặc xóa lịch sử bằng thanh thao tác.',
                        ja: 'アクションバーを使用して、ズーム、セッションのリセット、または履歴の消去を行います。'
                    },
                    details: {
                        en: [
                            '1. Look for the action icons in the top-right corner.',
                            '2. Use "New Chat" to start a fresh session context.',
                            '3. Use "Clear History" to remove all past messages.',
                            '4. Other icons may provide zooming or settings options.'
                        ],
                        vi: [
                            '1. Tìm các biểu tượng thao tác ở góc trên bên phải.',
                            '2. Sử dụng "Chat mới" để bắt đầu bối cảnh phiên mới.',
                            '3. Sử dụng "Xóa lịch sử" để xóa tất cả tin nhắn cũ.',
                            '4. Các biểu tượng khác có thể cung cấp tùy chọn phóng to hoặc cài đặt.'
                        ],
                        ja: [
                            '1. 右上のアクションアイコンを探します。',
                            '2. 「新しいチャット」を使用して、新しいセッションコンテキストを開始します。',
                            '3. 「履歴を消去」を使用して、過去のすべてのメッセージを削除します。',
                            '4. その他のアイコンには、ズームや設定オプションがある場合があります。'
                        ]
                    }
                }
            ]
        },
        {
            tabId: 'history',
            tabTitle: { en: 'History Management', vi: 'Quản Lý Lịch Sử', ja: '履歴管理' },
            steps: [
                {
                    id: 'step1',
                    title: { en: 'View Past Chats', vi: 'Xem Chat Cũ', ja: '過去のチャットを表示' },
                    description: {
                        en: 'Access your previous conversations from the sidebar.',
                        vi: 'Truy cập các cuộc trò chuyện trước đây của bạn từ thanh bên.',
                        ja: 'サイドバーから過去の会話にアクセスします。'
                    },
                    details: {
                        en: [
                            '1. Open the left sidebar if it is collapsed.',
                            '2. Click on "Chat History" to view a list of past sessions.',
                            '3. Click on any session to load the conversation context.'
                        ],
                        vi: [
                            '1. Mở thanh bên trái nếu nó đang bị thu nhỏ.',
                            '2. Nhấp vào "Lịch sử Chat" để xem danh sách các phiên cũ.',
                            '3. Nhấp vào bất kỳ phiên nào để tải bối cảnh cuộc trò chuyện.'
                        ],
                        ja: [
                            '1. 左側のサイドバーが折りたたまれている場合は開きます。',
                            '2. 「チャット履歴」をクリックして、過去のセッションのリストを表示します。',
                            '3. 任意のセッションをクリックして、会話コンテキストを読み込みます。'
                        ]
                    }
                }
            ]
        },
        {
            tabId: 'promptGuideline',
            tabTitle: { en: 'Prompt Guideline', vi: 'Hướng Dẫn Viết Prompt', ja: 'プロンプトガイドライン' },
            steps: [
                {
                    id: 'step1',
                    title: { en: 'Basic Prompt Formula', vi: 'Công Thức Prompt Cơ Bản', ja: '基本プロンプト公式' },
                    description: {
                        en: 'Learn the simple 2-part formula to write effective prompts.',
                        vi: 'Học công thức 2 phần đơn giản để viết prompt hiệu quả.',
                        ja: '効果的なプロンプトを書くためのシンプルな2部構成の公式を学びます。'
                    },
                    details: {
                        en: [
                            '### 📝 The 2-Part Structure: Task Definition + User Query',
                            '',
                            '**Part 1: Task Definition (First Line)**',
                            '',
                            '- Tell the AI what task you want it to perform',
                            '- Use clear action words: Summarize, Compare, Explain, Find, List, Analyze',
                            '- Keep it as a single instruction line',
                            '',
                            '**Part 2: User Query (Second Line - Use 5W1H)**',
                            '',
                            '- Start a new line after Part 1',
                            '- Ask ONE specific question using 5W1H: What, Who, When, Where, Why, or How',
                            '- Only ONE question type per prompt',
                            '',
                            '---',
                            '',
                            '### ✅ Correct Format Examples:',
                            '',
                            '**Example 1:**',
                            '```',
                            'Summarize the main features of the User Manual.',
                            'What are the key benefits for end users?',
                            '```',
                            '',
                            '**Example 2:**',
                            '```',
                            'Compare Product A and Product B specifications.',
                            'Which product has better performance?',
                            '```',
                            '',
                            '**Example 3:**',
                            '```',
                            'Analyze the login authentication process.',
                            'How does the system verify user credentials?',
                            '```',
                            '',
                            '**Example 4:**',
                            '```',
                            'Find all pricing information in the documents.',
                            'What are the different pricing tiers available?',
                            '```'
                        ],
                        vi: [
                            '### 📝 Cấu Trúc 2 Phần: Định Nghĩa Nhiệm Vụ + Câu Hỏi',
                            '',
                            '**Phần 1: Định Nghĩa Nhiệm Vụ (Dòng Đầu)**',
                            '',
                            '- Nói cho AI biết nhiệm vụ bạn muốn nó thực hiện',
                            '- Dùng từ hành động rõ ràng: Tóm tắt, So sánh, Giải thích, Tìm, Liệt kê, Phân tích',
                            '- Giữ nó như một dòng chỉ thị duy nhất',
                            '',
                            '**Phần 2: Câu Hỏi (Dòng Thứ Hai - Dùng 5W1H)**',
                            '',
                            '- Xuống dòng mới sau Phần 1',
                            '- Hỏi MỘT câu hỏi cụ thể dùng 5W1H: Cái gì, Ai, Khi nào, Ở đâu, Tại sao, hoặc Như thế nào',
                            '- Chỉ MỘT loại câu hỏi mỗi prompt',
                            '',
                            '---',
                            '',
                            '### ✅ Ví Dụ Định Dạng Đúng:',
                            '',
                            '**Ví dụ 1:**',
                            '```',
                            'Tóm tắt các tính năng chính của Hướng dẫn Sử dụng.',
                            'Lợi ích chính cho người dùng cuối là gì?',
                            '```',
                            '',
                            '**Ví dụ 2:**',
                            '```',
                            'So sánh thông số kỹ thuật Sản phẩm A và Sản phẩm B.',
                            'Sản phẩm nào có hiệu suất tốt hơn?',
                            '```',
                            '',
                            '**Ví dụ 3:**',
                            '```',
                            'Phân tích quy trình xác thực đăng nhập.',
                            'Hệ thống xác minh thông tin người dùng như thế nào?',
                            '```',
                            '',
                            '**Ví dụ 4:**',
                            '```',
                            'Tìm tất cả thông tin về giá trong các tài liệu.',
                            'Các mức giá khác nhau có sẵn là gì?',
                            '```'
                        ],
                        ja: [
                            '### 📝 2部構成: タスク定義 + ユーザークエリ',
                            '',
                            '**パート1: タスク定義（1行目）**',
                            '',
                            '- AIに実行してほしいタスクを伝える',
                            '- 明確なアクションワードを使用: 要約、比較、説明、検索、リスト、分析',
                            '- 単一の指示行として保つ',
                            '',
                            '**パート2: ユーザークエリ（2行目 - 5W1Hを使用）**',
                            '',
                            '- パート1の後に改行',
                            '- 5W1Hを使って1つの具体的な質問: 何、誰、いつ、どこ、なぜ、またはどうやって',
                            '- プロンプトごとに1つの質問タイプのみ',
                            '',
                            '---',
                            '',
                            '### ✅ 正しいフォーマットの例:',
                            '',
                            '**例1:**',
                            '```',
                            'ユーザーマニュアルの主な機能を要約してください。',
                            'エンドユーザーにとっての主な利点は何ですか？',
                            '```',
                            '',
                            '**例2:**',
                            '```',
                            '製品Aと製品Bの仕様を比較してください。',
                            'どちらの製品がより優れたパフォーマンスを持っていますか？',
                            '```',
                            '',
                            '**例3:**',
                            '```',
                            'ログイン認証プロセスを分析してください。',
                            'システムはどのようにユーザー認証情報を検証しますか？',
                            '```',
                            '',
                            '**例4:**',
                            '```',
                            'ドキュメント内のすべての価格情報を検索してください。',
                            'どのような価格帯が利用可能ですか？',
                            '```'
                        ]
                    }
                },
                {
                    id: 'step2',
                    title: { en: 'Action Words Cheat Sheet', vi: 'Bảng Từ Hành Động', ja: 'アクションワード早見表' },
                    description: {
                        en: 'Pick the right action word for your task.',
                        vi: 'Chọn từ hành động phù hợp cho nhiệm vụ của bạn.',
                        ja: 'タスクに適したアクションワードを選びましょう。'
                    },
                    details: {
                        en: [
                            '### 🎯 Choose the right word based on what you need:',
                            '',
                            '| When you want to... | Use this word |',
                            '|---------------------|---------------|',
                            '| Get a short version | **Summarize** |',
                            '| See differences | **Compare** |',
                            '| Understand something | **Explain** |',
                            '| Search for info | **Find** |',
                            '| Get items in order | **List** |',
                            '| Deep understanding | **Analyze** |',
                            '| Check for problems | **Review** |',
                            '| Get step-by-step | **Describe** |',
                            '',
                            '---',
                            '',
                            '**💡 Pro Tip:** You can combine action words!',
                            '',
                            '- "**Find and summarize** all security requirements."',
                            '- "**Compare and explain** the differences between version 1 and 2."'
                        ],
                        vi: [
                            '### 🎯 Chọn từ phù hợp dựa trên nhu cầu của bạn:',
                            '',
                            '| Khi bạn muốn... | Dùng từ này |',
                            '|-----------------|-------------|',
                            '| Lấy phiên bản ngắn | **Tóm tắt** |',
                            '| Xem sự khác biệt | **So sánh** |',
                            '| Hiểu điều gì đó | **Giải thích** |',
                            '| Tìm kiếm thông tin | **Tìm** |',
                            '| Liệt kê theo thứ tự | **Liệt kê** |',
                            '| Hiểu sâu hơn | **Phân tích** |',
                            '| Kiểm tra vấn đề | **Xem xét** |',
                            '| Hướng dẫn từng bước | **Mô tả** |',
                            '',
                            '---',
                            '',
                            '**💡 Mẹo Hay:** Bạn có thể kết hợp các từ hành động!',
                            '',
                            '- "**Tìm và tóm tắt** tất cả yêu cầu bảo mật."',
                            '- "**So sánh và giải thích** sự khác biệt giữa phiên bản 1 và 2."'
                        ],
                        ja: [
                            '### 🎯 必要に応じて適切な言葉を選択:',
                            '',
                            '| したいこと... | 使う言葉 |',
                            '|--------------|----------|',
                            '| 短くまとめる | **要約** |',
                            '| 違いを見る | **比較** |',
                            '| 理解する | **説明** |',
                            '| 情報を探す | **検索** |',
                            '| 順番にリスト | **リスト** |',
                            '| 深く理解 | **分析** |',
                            '| 問題をチェック | **レビュー** |',
                            '| ステップバイステップ | **記述** |',
                            '',
                            '---',
                            '',
                            '**💡 プロのヒント:** アクションワードを組み合わせることができます！',
                            '',
                            '- "すべてのセキュリティ要件を**検索して要約**してください。"',
                            '- "バージョン1と2の違いを**比較して説明**してください。"'
                        ]
                    }
                },
                {
                    id: 'step3',
                    title: { en: 'Ready-to-Use Templates', vi: 'Mẫu Prompt Sẵn Dùng', ja: 'すぐに使えるテンプレート' },
                    description: {
                        en: 'Copy and customize these templates for common tasks.',
                        vi: 'Sao chép và tùy chỉnh các mẫu này cho các tác vụ phổ biến.',
                        ja: '一般的なタスク用にこれらのテンプレートをコピーしてカスタマイズ。'
                    },
                    details: {
                        en: [
                            '### 📋 Template 1: Summarization',
                            '',
                            '**Structure:**',
                            '```',
                            'Summarize [DOCUMENT NAME] focusing on [TOPIC].',
                            'What are the [SPECIFIC ASPECT]?',
                            '```',
                            '',
                            '**Example:**',
                            '```',
                            'Summarize the Annual Report focusing on financial performance.',
                            'What are the key revenue growth metrics?',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 Template 2: Comparison',
                            '',
                            '**Structure:**',
                            '```',
                            'Compare [ITEM A] with [ITEM B] in terms of [ASPECT].',
                            'Which [COMPARISON QUESTION]?',
                            '```',
                            '',
                            '**Example:**',
                            '```',
                            'Compare Basic Plan with Premium Plan in terms of features.',
                            'Which plan offers better value for small businesses?',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 Template 3: Find Information',
                            '',
                            '**Structure:**',
                            '```',
                            'Find all information about [TOPIC] in [DOCUMENT].',
                            'What are the [SPECIFIC DETAILS]?',
                            '```',
                            '',
                            '**Example:**',
                            '```',
                            'Find all information about payment methods in the User Guide.',
                            'What are the supported payment options?',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 Template 4: Process Explanation',
                            '',
                            '**Structure:**',
                            '```',
                            'Explain the [PROCESS NAME] in [SYSTEM/DOCUMENT].',
                            'How does [SPECIFIC STEP] work?',
                            '```',
                            '',
                            '**Example:**',
                            '```',
                            'Explain the password reset process in the Authentication System.',
                            'How does the system verify user identity?',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 Template 5: Quality Review',
                            '',
                            '**Structure:**',
                            '```',
                            'Review the [DOCUMENT/SECTION] for completeness.',
                            'What information is missing or unclear?',
                            '```',
                            '',
                            '**Example:**',
                            '```',
                            'Review the API Documentation for completeness.',
                            'What endpoint specifications are missing?',
                            '```'
                        ],
                        vi: [
                            '### 📋 Mẫu 1: Tóm Tắt',
                            '',
                            '**Cấu trúc:**',
                            '```',
                            'Tóm tắt [TÊN TÀI LIỆU] tập trung vào [CHỦ ĐỀ].',
                            '[KHÍA CẠNH CỤ THỂ] là gì?',
                            '```',
                            '',
                            '**Ví dụ:**',
                            '```',
                            'Tóm tắt Báo cáo Thường niên tập trung vào hiệu quả tài chính.',
                            'Các chỉ số tăng trưởng doanh thu chính là gì?',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 Mẫu 2: So Sánh',
                            '',
                            '**Cấu trúc:**',
                            '```',
                            'So sánh [MỤC A] với [MỤC B] về [KHÍA CẠNH].',
                            '[CÂU HỎI SO SÁNH] nào?',
                            '```',
                            '',
                            '**Ví dụ:**',
                            '```',
                            'So sánh Gói Cơ bản với Gói Cao cấp về tính năng.',
                            'Gói nào cung cấp giá trị tốt hơn cho doanh nghiệp nhỏ?',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 Mẫu 3: Tìm Thông Tin',
                            '',
                            '**Cấu trúc:**',
                            '```',
                            'Tìm tất cả thông tin về [CHỦ ĐỀ] trong [TÀI LIỆU].',
                            '[CHI TIẾT CỤ THỂ] là gì?',
                            '```',
                            '',
                            '**Ví dụ:**',
                            '```',
                            'Tìm tất cả thông tin về phương thức thanh toán trong Hướng dẫn Sử dụng.',
                            'Các phương thức thanh toán được hỗ trợ là gì?',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 Mẫu 4: Giải Thích Quy Trình',
                            '',
                            '**Cấu trúc:**',
                            '```',
                            'Giải thích [TÊN QUY TRÌNH] trong [HỆ THỐNG/TÀI LIỆU].',
                            '[BƯỚC CỤ THỂ] hoạt động như thế nào?',
                            '```',
                            '',
                            '**Ví dụ:**',
                            '```',
                            'Giải thích quy trình đặt lại mật khẩu trong Hệ thống Xác thực.',
                            'Hệ thống xác minh danh tính người dùng như thế nào?',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 Mẫu 5: Đánh Giá Chất Lượng',
                            '',
                            '**Cấu trúc:**',
                            '```',
                            'Xem xét [TÀI LIỆU/PHẦN] về tính đầy đủ.',
                            'Thông tin nào bị thiếu hoặc không rõ ràng?',
                            '```',
                            '',
                            '**Ví dụ:**',
                            '```',
                            'Xem xét Tài liệu API về tính đầy đủ.',
                            'Thông số kỹ thuật endpoint nào bị thiếu?',
                            '```'
                        ],
                        ja: [
                            '### 📋 テンプレート1: 要約',
                            '',
                            '**構造:**',
                            '```',
                            '[トピック]に焦点を当てて[ドキュメント名]を要約してください。',
                            '[特定の側面]は何ですか？',
                            '```',
                            '',
                            '**例:**',
                            '```',
                            '財務パフォーマンスに焦点を当てて年次報告書を要約してください。',
                            '主な収益成長指標は何ですか？',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 テンプレート2: 比較',
                            '',
                            '**構造:**',
                            '```',
                            '[側面]の観点から[項目A]と[項目B]を比較してください。',
                            '[比較質問]はどれですか？',
                            '```',
                            '',
                            '**例:**',
                            '```',
                            '機能の観点からベーシックプランとプレミアムプランを比較してください。',
                            '小規模企業にとってどちらのプランがより良い価値を提供しますか？',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 テンプレート3: 情報検索',
                            '',
                            '**構造:**',
                            '```',
                            '[ドキュメント]内の[トピック]に関するすべての情報を検索してください。',
                            '[具体的な詳細]は何ですか？',
                            '```',
                            '',
                            '**例:**',
                            '```',
                            'ユーザーガイド内の支払い方法に関するすべての情報を検索してください。',
                            'サポートされている支払いオプションは何ですか？',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 テンプレート4: プロセスの説明',
                            '',
                            '**構造:**',
                            '```',
                            '[システム/ドキュメント]内の[プロセス名]を説明してください。',
                            '[特定のステップ]はどのように機能しますか？',
                            '```',
                            '',
                            '**例:**',
                            '```',
                            '認証システム内のパスワードリセットプロセスを説明してください。',
                            'システムはどのようにユーザーのアイデンティティを検証しますか？',
                            '```',
                            '',
                            '---',
                            '',
                            '### 📋 テンプレート5: 品質レビュー',
                            '',
                            '**構造:**',
                            '```',
                            '完全性について[ドキュメント/セクション]をレビューしてください。',
                            'どの情報が不足または不明確ですか？',
                            '```',
                            '',
                            '**例:**',
                            '```',
                            '完全性についてAPIドキュメントをレビューしてください。',
                            'どのエンドポイント仕様が不足していますか？',
                            '```'
                        ]
                    }
                },
                {
                    id: 'step4',
                    title: { en: 'Advanced: 1H5W Method', vi: 'Nâng Cao: Phương Pháp 1H5W', ja: '上級: 1H5Wメソッド' },
                    description: {
                        en: 'Use the 1H5W framework for comprehensive analysis.',
                        vi: 'Sử dụng khung 1H5W để phân tích toàn diện.',
                        ja: '包括的な分析のために1H5Wフレームワークを使用。'
                    },
                    details: {
                        en: [
                            '### 🔍 What is 1H5W?',
                            '',
                            'A powerful method to get complete information by asking 6 key questions.',
                            '',
                            '| Question | What it means |',
                            '|----------|---------------|',
                            '| **Who** | Who is involved? Who does it? |',
                            '| **What** | What happens? What is needed? |',
                            '| **Where** | Where does it happen? Where is data stored? |',
                            '| **When** | When does it happen? What triggers it? |',
                            '| **Why** | Why is it done? What is the purpose? |',
                            '| **How** | How does it work? What are the steps? |',
                            '',
                            '---',
                            '',
                            '### 📌 Example Prompt using 1H5W:',
                            '',
                            '```text',
                            'Analyze the User Registration process using 1H5W:',
                            '- Who: Who can register?',
                            '- What: What information is collected?',
                            '- Where: Where is user data stored?',
                            '- When: When is the account activated?',
                            '- Why: Why are certain fields required?',
                            '- How: How is the email verified?',
                            '```',
                            '',
                            '**💡 When to use 1H5W:**',
                            '',
                            '- Understanding complex workflows',
                            '- Analyzing business processes',
                            '- Reviewing system documentation',
                            '- Creating comprehensive reports'
                        ],
                        vi: [
                            '🔍 **1H5W là gì?**',
                            'Một phương pháp mạnh mẽ để có thông tin đầy đủ bằng cách đặt 6 câu hỏi chính.',
                            '',
                            '| Câu hỏi | Ý nghĩa |',
                            '|---------|---------|',
                            '| **Ai (Who)** | Ai tham gia? Ai thực hiện? |',
                            '| **Cái gì (What)** | Điều gì xảy ra? Cần gì? |',
                            '| **Ở đâu (Where)** | Xảy ra ở đâu? Dữ liệu lưu ở đâu? |',
                            '| **Khi nào (When)** | Khi nào xảy ra? Điều gì kích hoạt? |',
                            '| **Tại sao (Why)** | Tại sao làm? Mục đích là gì? |',
                            '| **Như thế nào (How)** | Hoạt động thế nào? Các bước là gì? |',
                            '',
                            '---',
                            '**📌 Ví dụ Prompt sử dụng 1H5W:**',
                            '```',
                            'Phân tích quy trình Đăng ký Người dùng sử dụng 1H5W:',
                            '- Ai: Ai có thể đăng ký?',
                            '- Cái gì: Thông tin nào được thu thập?',
                            '- Ở đâu: Dữ liệu người dùng lưu ở đâu?',
                            '- Khi nào: Khi nào tài khoản được kích hoạt?',
                            '- Tại sao: Tại sao một số trường bắt buộc?',
                            '- Như thế nào: Email được xác minh như thế nào?',
                            '```',
                            '',
                            '**💡 Khi nào nên dùng 1H5W:**',
                            '• Hiểu các quy trình phức tạp',
                            '• Phân tích quy trình kinh doanh',
                            '• Xem xét tài liệu hệ thống',
                            '• Tạo báo cáo toàn diện'
                        ],
                        ja: [
                            '🔍 **1H5Wとは？**',
                            '6つの重要な質問で完全な情報を得るための強力な方法。',
                            '',
                            '| 質問 | 意味 |',
                            '|------|------|',
                            '| **誰 (Who)** | 誰が関わる？誰がする？ |',
                            '| **何 (What)** | 何が起こる？何が必要？ |',
                            '| **どこ (Where)** | どこで起こる？データはどこに保存？ |',
                            '| **いつ (When)** | いつ起こる？何がトリガー？ |',
                            '| **なぜ (Why)** | なぜする？目的は？ |',
                            '| **どうやって (How)** | どう動く？手順は？ |',
                            '',
                            '---',
                            '**📌 1H5Wを使用したプロンプト例:**',
                            '```',
                            'ユーザー登録プロセスを1H5Wで分析:',
                            '- 誰: 誰が登録できる？',
                            '- 何: どんな情報が収集される？',
                            '- どこ: ユーザーデータはどこに保存？',
                            '- いつ: アカウントはいつ有効になる？',
                            '- なぜ: なぜ特定のフィールドが必須？',
                            '- どうやって: メールはどう検証される？',
                            '```',
                            '',
                            '**💡 1H5Wを使うタイミング:**',
                            '• 複雑なワークフローを理解',
                            '• ビジネスプロセスを分析',
                            '• システムドキュメントをレビュー',
                            '• 包括的なレポートを作成'
                        ]
                    }
                },
                {
                    id: 'step5',
                    title: { en: 'Common Mistakes to Avoid', vi: 'Lỗi Thường Gặp Cần Tránh', ja: '避けるべき一般的な間違い' },
                    description: {
                        en: 'Learn what NOT to do when writing prompts.',
                        vi: 'Học những điều KHÔNG nên làm khi viết prompt.',
                        ja: 'プロンプト作成時にやってはいけないことを学ぶ。'
                    },
                    details: {
                        en: [
                            '### 🚫 Mistake 1: Being too vague',
                            '',
                            '❌ **BAD:** "Tell me about this document"',
                            '',
                            '✅ **GOOD:** "Summarize the main features in the Product Manual"',
                            '',
                            '---',
                            '',
                            '### 🚫 Mistake 2: Asking multiple unrelated questions',
                            '',
                            '❌ **BAD:** "What is the price and also explain the login and list all employees?"',
                            '',
                            '✅ **GOOD:** Ask one clear question at a time, or group related questions',
                            '',
                            '---',
                            '',
                            '### 🚫 Mistake 3: Not specifying the document',
                            '',
                            '❌ **BAD:** "What are the requirements?"',
                            '',
                            '✅ **GOOD:** "What are the requirements in the SRS document?"',
                            '',
                            '---',
                            '',
                            '### 🚫 Mistake 4: Using unclear pronouns',
                            '',
                            '❌ **BAD:** "Compare it with the other one"',
                            '',
                            '✅ **GOOD:** "Compare the Basic Plan with the Premium Plan"',
                            '',
                            '---',
                            '',
                            '### 🚫 Mistake 5: Expecting AI to guess',
                            '',
                            '❌ **BAD:** "You know what I mean, right?"',
                            '',
                            '✅ **GOOD:** Be explicit about what you want',
                            '',
                            '---',
                            '',
                            '💡 **Remember:** The clearer your question, the better the answer!'
                        ],
                        vi: [
                            '🚫 **Lỗi 1: Quá mơ hồ**',
                            '❌ SAI: "Cho tôi biết về tài liệu này"',
                            '✅ ĐÚNG: "Tóm tắt các tính năng chính trong Hướng dẫn Sản phẩm"',
                            '',
                            '---',
                            '🚫 **Lỗi 2: Hỏi nhiều câu không liên quan**',
                            '❌ SAI: "Giá là bao nhiêu và cũng giải thích đăng nhập và liệt kê tất cả nhân viên?"',
                            '✅ ĐÚNG: Hỏi từng câu rõ ràng, hoặc nhóm các câu hỏi liên quan',
                            '',
                            '---',
                            '🚫 **Lỗi 3: Không chỉ rõ tài liệu**',
                            '❌ SAI: "Các yêu cầu là gì?"',
                            '✅ ĐÚNG: "Các yêu cầu trong tài liệu SRS là gì?"',
                            '',
                            '---',
                            '🚫 **Lỗi 4: Dùng đại từ không rõ ràng**',
                            '❌ SAI: "So sánh nó với cái kia"',
                            '✅ ĐÚNG: "So sánh Gói Cơ bản với Gói Cao cấp"',
                            '',
                            '---',
                            '🚫 **Lỗi 5: Mong đợi AI đoán ý**',
                            '❌ SAI: "Bạn hiểu ý tôi chứ?"',
                            '✅ ĐÚNG: Nói rõ ràng về những gì bạn muốn',
                            '',
                            '---',
                            '💡 **Nhớ:** Câu hỏi càng rõ ràng, câu trả lời càng tốt!'
                        ],
                        ja: [
                            '🚫 **間違い1: 曖昧すぎる**',
                            '❌ 悪い例: "このドキュメントについて教えて"',
                            '✅ 良い例: "製品マニュアルの主な機能を要約してください"',
                            '',
                            '---',
                            '🚫 **間違い2: 関連のない複数の質問**',
                            '❌ 悪い例: "価格は何で、ログインも説明して、全従業員もリストして？"',
                            '✅ 良い例: 一度に一つの明確な質問、または関連する質問をグループ化',
                            '',
                            '---',
                            '🚫 **間違い3: ドキュメントを指定しない**',
                            '❌ 悪い例: "要件は何ですか？"',
                            '✅ 良い例: "SRSドキュメントの要件は何ですか？"',
                            '',
                            '---',
                            '🚫 **間違い4: 不明確な代名詞を使う**',
                            '❌ 悪い例: "それをあれと比較して"',
                            '✅ 良い例: "ベーシックプランとプレミアムプランを比較してください"',
                            '',
                            '---',
                            '🚫 **間違い5: AIに推測させる**',
                            '❌ 悪い例: "分かるでしょ？"',
                            '✅ 良い例: 欲しいものを明確に伝える',
                            '',
                            '---',
                            '💡 **覚えておいて:** 質問が明確なほど、回答も良くなります！'
                        ]
                    }
                },
                {
                    id: 'step6',
                    title: { en: 'Quick Reference Card', vi: 'Thẻ Tham Khảo Nhanh', ja: 'クイックリファレンスカード' },
                    description: {
                        en: 'Save this checklist for writing great prompts.',
                        vi: 'Lưu danh sách kiểm tra này để viết prompt tốt.',
                        ja: '優れたプロンプトを書くためにこのチェックリストを保存。'
                    },
                    details: {
                        en: [
                            '### ✅ Before You Send, Check:',
                            '',
                            '- ☐ Did I start with an action word? (Summarize, Compare, Find, etc.)',
                            '- ☐ Did I mention the document or topic name?',
                            '- ☐ Did I specify what I want to focus on?',
                            '- ☐ Is my question specific enough?',
                            '- ☐ Am I asking only related questions together?',
                            '',
                            '---',
                            '',
                            '### 📝 Quick Formula Reminder:',
                            '',
                            '```text',
                            '[ACTION WORD] + [DOCUMENT/TOPIC] + [SPECIFIC FOCUS]',
                            '```',
                            '',
                            '**Example:**',
                            '',
                            '"**Summarize** the **User Guide** focusing on **account setup steps**"',
                            '',
                            '---',
                            '',
                            '### 🎯 Power Words to Use:',
                            '',
                            '- Summarize • Compare • Explain • Find',
                            '- List • Analyze • Review • Describe',
                            '- Check • Identify • Extract • Map',
                            '',
                            '---',
                            '',
                            '🚀 **You are ready! Start asking questions!**'
                        ],
                        vi: [
                            '✅ **Trước Khi Gửi, Kiểm Tra:**',
                            '',
                            '☐ Tôi đã bắt đầu bằng từ hành động chưa? (Tóm tắt, So sánh, Tìm, v.v.)',
                            '☐ Tôi đã đề cập tên tài liệu hoặc chủ đề chưa?',
                            '☐ Tôi đã chỉ rõ muốn tập trung vào điều gì chưa?',
                            '☐ Câu hỏi của tôi đủ cụ thể chưa?',
                            '☐ Tôi chỉ hỏi các câu hỏi liên quan với nhau chứ?',
                            '',
                            '---',
                            '📝 **Nhắc Nhở Công Thức Nhanh:**',
                            '',
                            '```',
                            '[TỪ HÀNH ĐỘNG] + [TÀI LIỆU/CHỦ ĐỀ] + [TRỌNG TÂM CỤ THỂ]',
                            '```',
                            '',
                            '**Ví dụ:**',
                            '"**Tóm tắt** **Hướng dẫn Sử dụng** tập trung vào **các bước thiết lập tài khoản**"',
                            '',
                            '---',
                            '🎯 **Từ Mạnh Nên Dùng:**',
                            '• Tóm tắt • So sánh • Giải thích • Tìm',
                            '• Liệt kê • Phân tích • Xem xét • Mô tả',
                            '• Kiểm tra • Xác định • Trích xuất • Ánh xạ',
                            '',
                            '---',
                            '🚀 **Bạn đã sẵn sàng! Hãy bắt đầu đặt câu hỏi!**'
                        ],
                        ja: [
                            '✅ **送信前にチェック:**',
                            '',
                            '☐ アクションワードで始めた？（要約、比較、検索など）',
                            '☐ ドキュメントまたはトピック名を記載した？',
                            '☐ 何に焦点を当てたいか指定した？',
                            '☐ 質問は十分に具体的？',
                            '☐ 関連する質問だけを一緒に聞いている？',
                            '',
                            '---',
                            '📝 **クイック公式リマインダー:**',
                            '',
                            '```',
                            '[アクションワード] + [ドキュメント/トピック] + [具体的な焦点]',
                            '```',
                            '',
                            '**例:**',
                            '"**ユーザーガイド**を**アカウント設定手順**に焦点を当てて**要約**してください"',
                            '',
                            '---',
                            '🎯 **使うべきパワーワード:**',
                            '• 要約 • 比較 • 説明 • 検索',
                            '• リスト • 分析 • レビュー • 記述',
                            '• チェック • 特定 • 抽出 • マップ',
                            '',
                            '---',
                            '🚀 **準備完了！質問を始めましょう！**'
                        ]
                    }
                }
            ]
        },
        {
            tabId: 'historySearch',
            tabTitle: { en: 'Search & Filter', vi: 'Tìm Kiếm & Lọc', ja: '検索とフィルタ' },
            steps: [
                {
                    id: 'step1',
                    title: { en: 'Search History', vi: 'Tìm Kiếm Lịch Sử', ja: '履歴を検索' },
                    description: {
                        en: 'Search through your chat history by keywords.',
                        vi: 'Tìm kiếm qua lịch sử trò chuyện của bạn bằng từ khóa.',
                        ja: 'キーワードでチャット履歴を検索します。'
                    },
                    details: {
                        en: [
                            '1. In the History sidebar, locate the search bar at the top.',
                            '2. Type keywords related to the conversation you want to find.',
                            '3. Press Enter or wait for the results to filter automatically.'
                        ],
                        vi: [
                            '1. Trong thanh bên Lịch sử, tìm thanh tìm kiếm ở trên cùng.',
                            '2. Nhập từ khóa liên quan đến cuộc trò chuyện bạn muốn tìm.',
                            '3. Nhấn Enter hoặc đợi kết quả tự động lọc.'
                        ],
                        ja: [
                            '1. 履歴サイドバーの上部にある検索バーを見つけます。',
                            '2. 見つけたい会話に関連するキーワードを入力します。',
                            '3. Enterを押すか、結果が自動的にフィルタリングされるのを待ちます。'
                        ]
                    }
                },
                {
                    id: 'step2',
                    title: { en: 'Filter Options', vi: 'Tùy Chọn Lọc', ja: 'フィルタオプション' },
                    description: {
                        en: 'Filter sessions by date range using date pickers.',
                        vi: 'Lọc các phiên theo phạm vi ngày bằng bộ chọn ngày.',
                        ja: '日付ピッカーを使用して日付範囲でセッションをフィルタリングします。'
                    },
                    details: {
                        en: [
                            '1. Click the filter icon next to the search bar to open the "Filter History" dialog.',
                            '2. **Start Date**: Click the date picker and select the beginning date of your range.',
                            '3. **End Date**: Click the date picker and select the ending date of your range.',
                            '4. Click **"Apply Filters"** to filter the history list by the selected date range.',
                            '5. Click **"Reset"** to clear all date filters and show all history.'
                        ],
                        vi: [
                            '1. Nhấp vào biểu tượng bộ lọc bên cạnh thanh tìm kiếm để mở hộp thoại "Lọc Lịch Sử".',
                            '2. **Ngày Bắt Đầu**: Nhấp vào bộ chọn ngày và chọn ngày bắt đầu của phạm vi.',
                            '3. **Ngày Kết Thúc**: Nhấp vào bộ chọn ngày và chọn ngày kết thúc của phạm vi.',
                            '4. Nhấp **"Áp Dụng Bộ Lọc"** để lọc danh sách lịch sử theo phạm vi ngày đã chọn.',
                            '5. Nhấp **"Đặt Lại"** để xóa tất cả bộ lọc ngày và hiển thị toàn bộ lịch sử.'
                        ],
                        ja: [
                            '1. 検索バーの横にあるフィルタアイコンをクリックして「履歴をフィルタ」ダイアログを開きます。',
                            '2. **開始日**: 日付ピッカーをクリックして、範囲の開始日を選択します。',
                            '3. **終了日**: 日付ピッカーをクリックして、範囲の終了日を選択します。',
                            '4. **「フィルタを適用」** をクリックして、選択した日付範囲で履歴リストをフィルタリングします。',
                            '5. **「リセット」** をクリックして、すべての日付フィルタをクリアし、すべての履歴を表示します。'
                        ]
                    }
                }
            ]
        }
    ],
    tourSteps: [
        {
            target: '#agent-selector',
            content: { en: 'Select your AI agent here.', vi: 'Chọn trợ lý AI của bạn tại đây.', ja: 'ここでAIエージェントを選択します。' }
        },
        {
            target: '#prompt-library-btn',
            content: { en: 'Open prompt library.', vi: 'Mở thư viện gợi ý.', ja: 'プロンプトライブラリを開く。' }
        }
    ]
};
