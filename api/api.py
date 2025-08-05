# /api/api.py
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS # 1. Importa a biblioteca CORS
from PIL import Image, UnidentifiedImageError
import io
import zipfile
import datetime
import pandas as pd
import requests
from urllib.parse import urlparse

# Inicializa a aplicação Flask
app = Flask(__name__)
CORS(app) # 2. Ativa o CORS para toda a aplicação

# --- Rota da API para Baixar Fotos de Produtos via CSV ---
@app.route('/api/download-products', methods=['POST'])
def download_products_api():
    """
    Recebe um arquivo CSV, baixa as imagens listadas e retorna um arquivo zip.
    """
    if 'csv-file' not in request.files:
        return jsonify({"error": "Nenhum arquivo CSV enviado"}), 400
    
    csv_file = request.files['csv-file']
    
    try:
        # Usamos io.StringIO para ler o arquivo em memória, garantindo compatibilidade
        csv_content = io.StringIO(csv_file.stream.read().decode("utf-8"))
        df = pd.read_csv(csv_content)
    except Exception as e:
        return jsonify({"error": f"Erro ao ler o arquivo CSV: {e}"}), 400

    if 'sku' not in df.columns or 'images' not in df.columns:
        return jsonify({"error": "O CSV deve ter as colunas 'sku' e 'images'"}), 400

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'a', zipfile.ZIP_DEFLATED, False) as zip_file:
        for _, row in df.iterrows():
            sku = str(row['sku']).strip()
            image_urls_str = str(row['images']).strip()

            # Pula linhas onde a coluna de imagens está vazia
            if pd.isna(row['images']) or not image_urls_str:
                continue

            image_urls = [url.strip() for url in image_urls_str.split(';') if url.strip()]

            for i, url in enumerate(image_urls):
                try:
                    # Faz o download da imagem
                    response = requests.get(url, timeout=10)
                    response.raise_for_status() # Lança um erro para status ruins (4xx ou 5xx)
                    
                    # Determina a extensão do arquivo a partir da URL
                    path = urlparse(url).path
                    # Pega a parte depois do último ponto no caminho
                    ext = path.split('.')[-1] if '.' in path else 'jpg'

                    # Cria o nome do arquivo e o salva no zip
                    filename = f"{sku}_{i + 1}.{ext}"
                    zip_file.writestr(filename, response.content)

                except requests.exceptions.RequestException as e:
                    # Se houver erro no download, imprime no console do servidor e continua
                    print(f"Erro ao baixar a imagem {url} para o SKU {sku}: {e}")
                    continue
    
    zip_buffer.seek(0)
    
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='fotos_produtos.zip'
    )


# --- Rota da API para Comprimir Imagens ---
@app.route('/api/compress', methods=['POST'])
def compress_images_api():
    """
    Recebe arquivos de imagem, comprime-os e retorna um arquivo zip
    junto com um relatório de otimização.
    """
    files = request.files.getlist('files')
    if not files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400

    report_lines = []
    total_original_size = 0
    total_final_size = 0
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'a', zipfile.ZIP_DEFLATED, False) as zip_file:
        for file in files:
            filename = file.filename
            original_file_content = file.read()
            original_size = len(original_file_content)
            total_original_size += original_size
            final_size = original_size
            status_message = "Copiado (formato não otimizável)"

            try:
                img = Image.open(io.BytesIO(original_file_content))
                optimized_image_data = io.BytesIO()
                
                if img.format.lower() in ['jpeg', 'jpg']:
                    img.save(optimized_image_data, format='JPEG', quality=85, optimize=True)
                    status_message = "Otimizado (JPG Qual: 85)"
                elif img.format.lower() == 'png':
                    img.save(optimized_image_data, format='PNG', optimize=True)
                    status_message = "Otimizado (PNG Lossless)"
                else:
                    optimized_image_data.write(original_file_content)
                    status_message = f"Copiado ({img.format})"

                final_size = optimized_image_data.tell()

                if final_size >= original_size:
                    zip_file.writestr(filename, original_file_content)
                    final_size = original_size
                    status_message += " - Mantido (sem redução)"
                else:
                    zip_file.writestr(filename, optimized_image_data.getvalue())

            except UnidentifiedImageError:
                zip_file.writestr(filename, original_file_content)
            except Exception as e:
                zip_file.writestr(filename, original_file_content)
                status_message = f"Erro no processamento: {e}"

            total_final_size += final_size
            reduction = original_size - final_size
            reduction_percent = (reduction / original_size) * 100 if original_size > 0 else 0

            report_lines.append(
                f"{filename:<40} | {(original_size/1024):>15.2f} | {(final_size/1024):>15.2f} | {reduction_percent:>15.2f}% | {status_message}"
            )

        report_header = [
            f"--- Relatório de Otimização ({datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}) ---",
            "-" * 110,
            f"{'Nome do Arquivo':<40} | {'Original (KB)':>15} | {'Final (KB)':>15} | {'Redução (%)':>15} | {'Status'}",
            "-" * 110
        ]
        
        overall_reduction_bytes = total_original_size - total_final_size
        overall_reduction_percent = (overall_reduction_bytes / total_original_size) * 100 if total_original_size > 0 else 0
        
        report_summary = [
            "-" * 110,
            "### Resumo Final:",
            f"Tamanho Total Original: {total_original_size / (1024 * 1024):.2f} MB",
            f"Tamanho Total Final:   {total_final_size / (1024 * 1024):.2f} MB",
            f"Redução Total da Pasta: {overall_reduction_bytes / (1024 * 1024):.2f} MB ({overall_reduction_percent:.2f}%)"
        ]
        
        full_report = "\n".join(report_header + report_lines + report_summary)
        zip_file.writestr('relatorio_otimizacao.txt', full_report)

    zip_buffer.seek(0)
    
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='imagens_otimizadas.zip'
    )

if __name__ == '__main__':
    app.run(debug=True)
