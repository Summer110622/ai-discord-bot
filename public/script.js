document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('ask-form');
    const questionInput = document.getElementById('question');
    const responseDiv = document.getElementById('response');
    const submitButton = document.getElementById('submit-button');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const question = questionInput.value.trim();
        if (!question) {
            responseDiv.textContent = '質問を入力してください。';
            return;
        }

        // フォームを無効化して、処理中であることを示す
        submitButton.disabled = true;
        submitButton.textContent = '考え中...';
        responseDiv.textContent = 'AIからの返信を待っています...';

        try {
            const res = await fetch('/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ question: question }),
            });

            if (!res.ok) {
                // サーバーからのエラーレスポンスを処理
                const errorData = await res.json();
                throw new Error(errorData.error || `サーバーエラーが発生しました (ステータス: ${res.status})`);
            }

            const data = await res.json();
            responseDiv.textContent = data.response;

        } catch (error) {
            console.error('Fetchエラー:', error);
            responseDiv.textContent = `エラー: ${error.message}`;
        } finally {
            // フォームを再度有効化
            submitButton.disabled = false;
            submitButton.textContent = '送信';
            questionInput.value = ''; // 入力フィールドをクリア
        }
    });
});
