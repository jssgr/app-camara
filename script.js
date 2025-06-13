document.addEventListener('DOMContentLoaded', () => {
    // --- Constantes de configuración (Valores recomendados para la nueva lógica) ---
    const UMBRAL_SUMA_DE_BRILLO = 660; 
    const UMBRAL_SATURACION = 30;
    const AREA_REFLEJO_THRESHOLD = 0.2; // Lo subimos un poco, ya que el área de análisis es menor

    // --- Elementos del DOM (sin cambios) ---
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
    
    // --- Máquina de Estados (sin cambios) ---
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

    // --- Lógica de UI (sin cambios) ---
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
                if(canvasFront.width > 0) previewsContainer.classList.remove('hidden');
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

    // --- MODIFICADO: La función ahora analiza solo el centro de la imagen ---
    function analizarReflejos(canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Definimos un margen del 10% en cada lado para ignorar los bordes
        const marginX = canvas.width * 0.10;
        const marginY = canvas.height * 0.10;
        const analysisWidth = canvas.width - (2 * marginX);
        const analysisHeight = canvas.height - (2 * marginY);

        // Obtenemos los datos de píxeles solo del área central
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
        console.log(`Análisis de reflejos (área central): ${percentage.toFixed(2)}% de píxeles de reflejo (Umbral: ${AREA_REFLEJO_THRESHOLD}%)`);
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
            showMessage(`⚠️ Posible reflejo detectado en la captura del ${sideText}. Intente de nuevo con una luz más suave o un ángulo diferente.`);
        } else {
            const sideText = side === 'front' ? 'FRENTE' : 'REVERSO';
            showMessage(`Verifique la captura del ${sideText}.`);
        }
    }

    // --- Funciones de Soporte (sin cambios) ---
    const isLandscape = () => window.innerWidth > window.innerHeight;
    
    function resetSystemState() {
        clearTimeout(systemReadyTimeout);
        video.classList.remove('hidden');
        overlay.classList.remove('is-ready');
        overlay.classList.add('is-detecting');
        primaryActionBtn.disabled = true;
        const message = currentState === AppState.AWAITING_FRONT ? "🎥 Centre el FRENTE..." : "🔄 Centre el REVERSO...";
        showMessage(message);
        systemReadyTimeout = setTimeout(() => {
            overlay.classList.remove('is-detecting');
            overlay.classList.add('is-ready');
            updateButtonState();
        }, 2500);
    }
    
    function updateButtonState() {
        const isCaptureState = currentState === AppState.AWAITING_FRONT || currentState === AppState.AWAITING_BACK;
        if (isLandscape() && isCaptureState && overlay.classList.contains('is-ready')) {
            primaryActionBtn.disabled = false;
        } else if (isCaptureState) {
            primaryActionBtn.disabled = true;
        }
    }

    function checkOrientation() {
        rotateOverlay.classList.toggle('hidden', isLandscape());
        updateButtonState();
    }

    async function getCameras() {
        if (!navigator.mediaDevices?.enumerateDevices) {
            throw new Error("La enumeración de dispositivos no es soportada en este navegador.");
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        if (videoDevices.length === 0) throw new Error("No se encontraron cámaras.");
        
        const currentSelected = cameraSelect.value;
        cameraSelect.innerHTML = videoDevices.map((device, i) => {
            const label = device.label || `Cámara ${i + 1}`;
            return `<option value="${device.deviceId}">${label}</option>`;
        }).join('');
        
        const backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('trasera'));
        if (backCamera) {
            cameraSelect.value = backCamera.deviceId;
        } else if (currentSelected) {
            cameraSelect.value = currentSelected;
        }
    }

    async function startCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        let constraints;
        const videoConstraints = {
            width: { min: 1920, ideal: 3840 },
            height: { min: 1080, ideal: 2160 }
        };

        if (currentState === AppState.INIT) {
            constraints = {
                video: {
                    ...videoConstraints,
                    facingMode: { ideal: 'environment' }
                }
            };
        } else {
            constraints = {
                video: {
                    ...videoConstraints,
                    deviceId: { exact: cameraSelect.value }
                }
            };
        }

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            await new Promise(resolve => video.onloadedmetadata = resolve);

            if (currentState === AppState.INIT) {
                await getCameras();
                const currentTrack = currentStream.getVideoTracks()[0];
                const currentDeviceId = currentTrack.getSettings().deviceId;
                if(currentDeviceId) cameraSelect.value = currentDeviceId;
            }

            currentState = AppState.AWAITING_FRONT;
            updateUIForState();

        } catch (err) {
            console.error("Error al iniciar la cámara:", err.name, err.message);
            switch (err.name) {
                case 'NotAllowedError':
                    showMessage("Permiso de cámara denegado. Por favor, revisa los permisos para este sitio en los ajustes de tu navegador (usualmente en el ícono 🔒) y recarga la página.");
                    break;
                case 'NotFoundError':
                    showMessage("No se encontró ninguna cámara compatible en este dispositivo.");
                    break;
                case 'NotReadableError':
                case 'AbortError':
                    showMessage("Hubo un problema con tu cámara. Asegúrate de que no esté siendo usada por otra aplicación y recarga la página.");
                    break;
                case 'OverconstrainedError':
                     showMessage("La cámara de tu dispositivo no cumple con la resolución mínima requerida (Full HD 1080p).");
                     break;
                default:
                    showMessage("No se pudo iniciar la cámara. Puede que no sea compatible con las resoluciones solicitadas.");
                    break;
            }
            currentState = AppState.INIT;
            updateUIForState();
        }
    }

    function showMessage(text) { messageDiv.textContent = text || ""; }

    // --- Event Handlers (sin cambios) ---
    primaryActionBtn.addEventListener('click', () => {
        switch (currentState) {
            case AppState.INIT:
                showMessage("¡Todo listo! A continuación, tu navegador te pedirá permiso para usar la cámara. Por favor, selecciona 'Permitir'.");
                setTimeout(startCamera, 100);
                break;
            case AppState.AWAITING_FRONT: captureImage('front'); break;
            case AppState.FRONT_CAPTURED: currentState = AppState.AWAITING_BACK; updateUIForState(); break;
            case AppState.AWAITING_BACK: captureImage('back'); break;
            case AppState.BACK_CAPTURED: currentState = AppState.ALL_CAPTURED; updateUIForState(); break;
            case AppState.ALL_CAPTURED:
                const downloadCanvas = (canvas, filename) => { const l=document.createElement('a');l.download=filename;l.href=canvas.toDataURL('image/png');l.click();};
                downloadCanvas(canvasFront, `ID_${docType.value}_FRENTE.png`);
                setTimeout(() => downloadCanvas(canvasBack, `ID_${docType.value}_REVERSO.png`), 500);
                currentState = AppState.PROCESS_COMPLETE;
                updateUIForState();
                break;
        }
    });

    secondaryActionBtn.addEventListener('click', () => {
        currentState = (currentState === AppState.FRONT_CAPTURED) ? AppState.AWAITING_FRONT : AppState.AWAITING_BACK;
        updateUIForState();
    });

    newIdBtn.addEventListener('click', () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        [canvasFront, canvasBack].forEach(c => { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); });
        cameraSelect.innerHTML = '';
        currentState = AppState.INIT;
        updateUIForState();
    });

    cameraSelect.addEventListener('change', startCamera);

    docType.addEventListener('change', () => {
        const doc = docType.value;
        overlay.classList.toggle('overlay-ine', doc === 'ine' || doc === 'license' || doc === 'old_citizen');
        overlay.classList.toggle('overlay-passport', doc === 'passport');
    });

    window.addEventListener('resize', checkOrientation);

    function main() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showMessage("Tu navegador no es compatible con la captura de video. Por favor, utiliza un navegador moderno como Chrome o Firefox.");
            primaryActionBtn.disabled = true;
            docType.disabled = true;
            setupControls.classList.remove('hidden');
            mainControls.classList.remove('hidden');
            primaryActionBtn.textContent = 'Iniciar Captura';
            return;
        }
        updateUIForState();
    }
    
    main();
});
