document.addEventListener('DOMContentLoaded', () => {
    // --- Configuración Cognito ---
    const COGNITO_DOMAIN = "https://us-east-2hzvyeyito.auth.us-east-2.amazoncognito.com";
    const CLIENT_ID = "6b39hqau6fq2j29u05n79m5d4k";
    const REDIRECT_URI = "https://jssgr.github.io/app-camara/";
    const TOKEN_ENDPOINT = `${COGNITO_DOMAIN}/oauth2/token`;
    const API_URL = "https://y1932yqsn7.execute-api.us-east-2.amazonaws.com/prod/procesarImagenIdentificacion";

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const jwt = sessionStorage.getItem("jwtToken");

    if (!jwt && !code) {
        const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=code&scope=email+openid+phone&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
        window.location.href = loginUrl;
        return;
    }

    if (code) {
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code,
            redirect_uri: REDIRECT_URI
        });

        fetch(TOKEN_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body
        })
            .then(res => res.json())
            .then(data => {
                const jwtToken = data.id_token;
                if (jwtToken) {
                    sessionStorage.setItem("jwtToken", jwtToken);
                    window.history.replaceState({}, document.title, REDIRECT_URI);
                } else {
                    alert("Error al obtener token de acceso.");
                }
            })
            .catch(() => alert("Fallo al autenticar con Cognito."));
    }

    // --- Resto del código original (sin cambios innecesarios) ---
    const UMBRAL_SUMA_DE_BRILLO = 660;
    const UMBRAL_SATURACION = 30;
    const AREA_REFLEJO_THRESHOLD = 0.2;

    const primaryActionBtn = document.getElementById('primary-action-btn');
    const secondaryActionBtn = document.getElementById('secondary-action-btn');
    const cameraSelect = document.getElementById('cameraSelect');
    const docType = document.getElementById('docType');
    const messageDiv = document.getElementById('message');
    const rotateOverlay = document.getElementById('rotate-device-overlay');
    const mainControls = document.getElementById('main-controls');
    const finalControls = document.getElementById('final-controls');
    const newIdBtn = document.getElementById('new-id-btn');
    const setupControls = document.getElementById('setup-controls');
    const captureUiWrapper = document.getElementById('capture-ui-wrapper');
    const previewsContainer = document.getElementById('previews-container');
    const canvasFront = document.getElementById('canvas-front');
    const canvasBack = document.getElementById('canvas-back');
    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay-box');

    const AppState = {
        INIT: 'INIT',
        AWAITING_FRONT: 'AWAITING_FRONT',
        FRONT_CAPTURED: 'FRONT_CAPTURED',
        AWAITING_BACK: 'AWAITING_BACK',
        BACK_CAPTURED: 'BACK_CAPTURED',
        ALL_CAPTURED: 'ALL_CAPTURED',
        PROCESS_COMPLETE: 'PROCESS_COMPLETE'
    };
    let currentState = AppState.INIT;
    let currentStream = null;
    let systemReadyTimeout = null;

    function updateUIForState() {
        [captureUiWrapper, previewsContainer, mainControls, finalControls, secondaryActionBtn, setupControls].forEach(el => el.classList.add('hidden'));
        showMessage("");

        switch (currentState) {
            case AppState.INIT:
                setupControls.classList.remove('hidden');
                mainControls.classList.remove('hidden');
                primaryActionBtn.textContent = 'Iniciar Captura';
                primaryActionBtn.disabled = false;
                showMessage("Seleccione el tipo de documento.");
                break;

            case AppState.AWAITING_FRONT:
            case AppState.AWAITING_BACK:
                mainControls.classList.remove('hidden');
                captureUiWrapper.classList.remove('hidden');
                if (canvasFront.width > 0) previewsContainer.classList.remove('hidden');
                primaryActionBtn.textContent = currentState === AppState.AWAITING_FRONT ? 'Capturar Frente' : 'Capturar Reverso';
                resetSystemState();
                break;

            case AppState.FRONT_CAPTURED:
            case AppState.BACK_CAPTURED:
                mainControls.classList.remove('hidden');
                previewsContainer.classList.remove('hidden');
                secondaryActionBtn.classList.remove('hidden');
                primaryActionBtn.textContent = currentState === AppState.FRONT_CAPTURED ? 'Aceptar Frente' : 'Aceptar Reverso';
                secondaryActionBtn.textContent = currentState === AppState.FRONT_CAPTURED ? 'Reintentar Frente' : 'Reintentar Reverso';
                primaryActionBtn.disabled = false;
                secondaryActionBtn.disabled = false;
                break;

            case AppState.ALL_CAPTURED:
                mainControls.classList.remove('hidden');
                previewsContainer.classList.remove('hidden');
                primaryActionBtn.textContent = 'Enviar a BDR';
                primaryActionBtn.disabled = false;
                showMessage("✅ Capturas completadas.");
                break;

            case AppState.PROCESS_COMPLETE:
                finalControls.classList.remove('hidden');
                previewsContainer.classList.remove('hidden');
                showMessage("🚀 Proceso finalizado con éxito.");
                break;
        }
        checkOrientation();
    }

    function analizarReflejos(canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const marginX = canvas.width * 0.10;
        const marginY = canvas.height * 0.10;
        const analysisWidth = canvas.width - (2 * marginX);
        const analysisHeight = canvas.height - (2 * marginY);
        const imageData = ctx.getImageData(marginX, marginY, analysisWidth, analysisHeight);
        const data = imageData.data;
        let glarePixels = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if ((r + g + b) > UMBRAL_SUMA_DE_BRILLO) {
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                if ((max - min) < UMBRAL_SATURACION) {
                    glarePixels++;
                }
            }
        }

        const totalPixelsAnalizados = analysisWidth * analysisHeight;
        const percentage = (glarePixels / totalPixelsAnalizados) * 100;
        console.log(`Reflejo: ${percentage.toFixed(2)}%`);
        return percentage > AREA_REFLEJO_THRESHOLD;
    }

    function captureImage(side) {
        if (video.readyState < video.HAVE_METADATA) return;
        const targetCanvas = (side === 'front') ? canvasFront : canvasBack;
        const ctx = targetCanvas.getContext('2d');
        const videoRect = video.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        const scaleX = video.videoWidth / videoRect.width;
        const scaleY = video.videoHeight / videoRect.height;
        const cropX = (overlayRect.left - videoRect.left) * scaleX;
        const cropY = (overlayRect.top - videoRect.top) * scaleY;
        const cropWidth = overlayRect.width * scaleX;
        const cropHeight = overlayRect.height * scaleY;
        targetCanvas.width = cropWidth;
        targetCanvas.height = cropHeight;
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        clearTimeout(systemReadyTimeout);

        currentState = (side === 'front') ? AppState.FRONT_CAPTURED : AppState.BACK_CAPTURED;
        updateUIForState();

        if (analizarReflejos(targetCanvas)) {
            const sideText = side === 'front' ? 'FRENTE' : 'REVERSO';
            showMessage(`⚠️ Posible reflejo detectado en la captura del ${sideText}. Intente de nuevo.`);
        } else {
            const sideText = side === 'front' ? 'FRENTE' : 'REVERSO';
            showMessage(`Verifique la captura del ${sideText}.`);
        }
    }

    async function enviarImagen(canvas, nombre, jwtToken) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                const reader = new FileReader();
                reader.onloadend = async function () {
                    const base64Data = reader.result.split(',')[1];
                    try {
                        const res = await fetch(API_URL, {
                            method: "POST",
                            headers: {
                                "Authorization": jwtToken,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                image_name: nombre,
                                image_data: base64Data
                            })
                        });
                        if (!res.ok) throw new Error(await res.text());
                        resolve();
                    } catch (err) {
                        console.error("Error al enviar:", err);
                        reject(err);
                    }
                };
                reader.readAsDataURL(blob);
            }, "image/png");
        });
    }

    primaryActionBtn.addEventListener('click', () => {
        switch (currentState) {
            case AppState.INIT: showMessage("Activando cámara..."); setTimeout(startCamera, 100); break;
            case AppState.AWAITING_FRONT: captureImage('front'); break;
            case AppState.FRONT_CAPTURED: currentState = AppState.AWAITING_BACK; updateUIForState(); break;
            case AppState.AWAITING_BACK: captureImage('back'); break;
            case AppState.BACK_CAPTURED: currentState = AppState.ALL_CAPTURED; updateUIForState(); break;
            case AppState.ALL_CAPTURED:
                const jwt = sessionStorage.getItem("jwtToken");
                if (!jwt) return showMessage("Sesión expirada. Recarga e inicia sesión.");
                (async () => {
                    try {
                        await enviarImagen(canvasFront, `ID_${docType.value}_FRENTE.png`, jwt);
                        await enviarImagen(canvasBack, `ID_${docType.value}_REVERSO.png`, jwt);
                        currentState = AppState.PROCESS_COMPLETE;
                        updateUIForState();
                    } catch (err) {
                        showMessage("❌ Error al enviar imágenes.");
                    }
                })();
                break;
        }
    });

    // Resto del código (sin cambios): secondaryActionBtn, newIdBtn, cámara, orientación, etc...
    // (puedo completarlo también si lo deseas, pero no lo modifiqué)
});
