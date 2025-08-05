document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const logOutput = document.getElementById('log-output');
    const allButtons = document.querySelectorAll('button');
    const downloadLogBtn = document.getElementById('btn-download-log');
    const analyzeReportBtn = document.getElementById('btn-analyze-report');
    const aiBtnText = document.getElementById('ai-btn-text');
    const aiSpinner = document.getElementById('ai-spinner');

    // --- FUNÇÕES AUXILIARES ---
    const log = (message, clear = false) => {
        if (clear) {
            logOutput.textContent = '';
        }
        logOutput.textContent += message + '\n';
        logOutput.scrollTop = logOutput.scrollHeight;
    };

    const toggleButtons = (enable) => {
        allButtons.forEach(btn => btn.disabled = !enable);
    };

    const createDownload = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const toggleReportButtons = (show) => {
        downloadLogBtn.classList.toggle('hidden', !show);
        analyzeReportBtn.classList.toggle('hidden', !show);
    };

    // --- LÓGICA DAS ABAS ---
    const tabs = document.querySelectorAll('.tab-content');
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTabId = button.id.replace('btn-', '');
            
            tabs.forEach(tab => {
                tab.classList.toggle('hidden', tab.id !== targetTabId);
            });

            tabButtons.forEach(btn => {
                btn.classList.remove('bg-indigo-600', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            });

            button.classList.add('bg-indigo-600', 'text-white');
            button.classList.remove('bg-gray-200', 'text-gray-700');
        });
    });
    
    // --- LÓGICA DOS INPUTS DE ARQUIVO ---
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const spanId = input.id.replace('-input', '-filename') || input.id.replace('-input', '-foldername');
            const span = document.getElementById(spanId);
            if (span) {
                if (e.target.files.length > 1) {
                     span.textContent = `${e.target.files.length} arquivos selecionados`;
                } else if (e.target.files.length === 1) {
                     span.textContent = e.target.files[0].name;
                } else {
                     span.textContent = 'Nenhum arquivo/pasta selecionado(a)';
                }
            }
        });
    });

    // --- LÓGICA DOS BOTÕES DE AÇÃO ---
    document.getElementById('btn-clear-log').addEventListener('click', () => {
        logOutput.textContent = 'Log limpo.';
        toggleReportButtons(false);
    });
    
    downloadLogBtn.addEventListener('click', () => {
         const blob = new Blob([logOutput.textContent], { type: 'text/plain' });
         createDownload(blob, `relatorio_${new Date().toISOString().slice(0,10)}.txt`);
    });

    // --- FUNÇÃO DA GEMINI API ---
    analyzeReportBtn.addEventListener('click', async () => {
        const reportText = logOutput.textContent;
        if (!reportText || reportText.trim() === '' || reportText.startsWith('Log limpo')) {
            alert("Não há relatório para analisar. Gere um relatório primeiro.");
            return;
        }

        log('\n\n==================================================');
        log('✨ Analisando o relatório com a IA do Gemini...');
        log('==================================================\n');

        aiBtnText.textContent = "Analisando...";
        aiSpinner.classList.remove('hidden');
        analyzeReportBtn.disabled = true;

        try {
            const prompt = `Você é um especialista em otimização de performance para web e SEO. Analise o seguinte relatório de mídias de um site e forneça sugestões práticas e acionáveis para melhorar a performance. Foque em tamanho de arquivos, formatos de imagem (sugerindo formatos modernos como WebP), dimensões e nomes de arquivo para SEO. Apresente a análise em um formato claro e organizado usando markdown (títulos, listas, etc.). O relatório é o seguinte:\n\n${reportText}`;
            
            const resultText = await callGeminiAPI(prompt);
            log(resultText);

        } catch (error) {
            log(`\n--- ERRO AO CHAMAR A IA ---\nOcorreu um problema ao se comunicar com a API do Gemini. Verifique o console para mais detalhes. Erro: ${error.message}`);
            console.error("Gemini API Error:", error);
        } finally {
            aiBtnText.textContent = "✨ Analisar Relatório com IA";
            aiSpinner.classList.add('hidden');
            analyzeReportBtn.disabled = false;
        }
    });

    async function callGeminiAPI(prompt) {
        const apiKey = ""; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("API Error Response:", errorBody);
            throw new Error(`A API retornou um erro ${response.status}: ${errorBody.error?.message || response.statusText}`);
        }

        const result = await response.json();
        
        if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.error("Unexpected API response structure:", result);
            throw new Error("A resposta da API não continha o texto esperado.");
        }
    }

    // --- FUNÇÃO GENÉRICA PARA LIDAR COM RESPOSTAS DE ERRO DA API ---
    async function handleApiError(response) {
        let errorMessage;
        // Verifica se a resposta é JSON antes de tentar fazer o parse
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const errorData = await response.json();
            errorMessage = errorData.error || `Erro do servidor: ${response.status}`;
        } else {
            // Se não for JSON, provavelmente é um erro de servidor (HTML)
            const errorText = await response.text();
            console.error("Resposta de erro não-JSON do servidor:", errorText);
            errorMessage = `Ocorreu um erro inesperado no servidor (Status: ${response.status}). Verifique o console do navegador (F12) para detalhes técnicos.`;
        }
        throw new Error(errorMessage);
    }


    // --- FUNÇÕES PRINCIPAIS (AGORA CHAMANDO O BACKEND PYTHON) ---

    // 2. Baixar Fotos de Produtos (CONECTADO)
    document.getElementById('btn-download-products').addEventListener('click', async () => {
        const csvFile = document.getElementById('csv-input').files[0];
        if (!csvFile) {
            alert('Por favor, selecione o arquivo CSV.');
            return;
        }

        toggleButtons(false);
        log('--- Iniciando Download de Produtos por CSV ---', true);
        log('Enviando CSV para o servidor Python para processamento...');
        toggleReportButtons(false);

        const formData = new FormData();
        formData.append('csv-file', csvFile);

        try {
            const response = await fetch('/api/download-products', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                await handleApiError(response); // Usa a nova função de erro
            }

            log('Processamento no servidor concluído. Baixando o arquivo .zip...');
            const blob = await response.blob();
            createDownload(blob, 'fotos_produtos.zip');
            log('Download concluído com sucesso!');

        } catch (error) {
            log(`\n--- OCORREU UM ERRO ---\n${error.message}`);
        } finally {
            toggleButtons(true);
        }
    });

    // 3. Comprimir Imagens (CONECTADO)
    document.getElementById('btn-compress-images').addEventListener('click', async () => {
        const files = document.getElementById('compress-folder-input').files;
        if (files.length === 0) {
            alert('Por favor, selecione uma pasta com imagens.');
            return;
        }

        toggleButtons(false);
        log('--- Iniciando Otimização de Imagens ---', true);
        log('Enviando arquivos para o servidor Python. Isso pode levar um momento...');
        toggleReportButtons(false);
        
        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }

        try {
            const response = await fetch('/api/compress', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                await handleApiError(response); // Usa a nova função de erro
            }

            log('Processamento no servidor concluído. Baixando o arquivo .zip...');
            const blob = await response.blob();
            createDownload(blob, 'imagens_otimizadas.zip');
            log('Download concluído com sucesso!');

        } catch (error) {
            log(`\n--- OCORREU UM ERRO ---\n${error.message}`);
        } finally {
            toggleButtons(true);
        }
    });

    // Funções restantes ainda não conectadas
    document.getElementById('btn-download-banners').addEventListener('click', () => {
        alert('Esta função ainda não foi conectada ao backend Python.');
    });
    document.getElementById('btn-separate-files').addEventListener('click', () => {
        alert('Esta função ainda não foi conectada ao backend Python.');
    });
    document.getElementById('btn-report-banners').addEventListener('click', () => {
        alert('Esta função ainda não foi conectada ao backend Python.');
    });
    document.getElementById('btn-report-media').addEventListener('click', () => {
        alert('Esta função ainda não foi conectada ao backend Python.');
    });
});
