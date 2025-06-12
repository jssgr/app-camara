document.addEventListener('DOMContentLoaded', () => {
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
                showMessage(`Verifique la captura del ${currentState === AppState.FRONT_CAPTURED ? 'FRENTE' : 'REVERSO'}.`);
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
        // --- MODIFICADO: Esta función ahora se llama DESPUÉS de obtener el primer permiso ---
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
        
        // Intenta pre-seleccionar la cámara trasera si está disponible
        const backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('trasera'));
        if (backCamera) {
            cameraSelect.value = backCamera.deviceId;
        } else if (currentSelected) {
            cameraSelect.value = currentSelected;
        }
    }

    // --- MODIFICADO: Función startCamera ahora usa restricciones genéricas la primera vez ---
    async function startCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        let constraints;
        // Si es la primera vez que pedimos la cámara, usamos una restricción genérica.
        if (currentState === AppState.INIT) {
            constraints = {
                video: {
                    facingMode: { ideal: 'environment' }, // Pide la cámara trasera de forma genérica
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };
        } else {
            // Si ya tenemos permiso y solo estamos cambiando de cámara, usamos el deviceId exacto.
            constraints = {
                video: {
                    deviceId: { exact: cameraSelect.value },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };
        }

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            await new Promise(resolve => video.onloadedmetadata = resolve);

            // Solo si es la primera vez, poblamos el selector de cámaras ahora que tenemos permiso
            if (currentState === AppState.INIT) {
                await getCameras();
                // Asegurarse de que el selector refleje la cámara activa actual
                const currentTrack = currentStream.getVideoTracks()[0];
                const currentDeviceId = currentTrack.getSettings().deviceId;
                if(currentDeviceId) cameraSelect.value = currentDeviceId;
            }

            currentState = AppState.AWAITING_FRONT;
            updateUIForState();

        } catch (err) {
            console.error("Error al iniciar la cámara:", err.name, err.message);
            // El manejo de errores específico sigue siendo válido
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
                default: // Incluye OverconstrainedError que podría ocurrir si las resoluciones no son soportadas
                    showMessage("No se pudo iniciar la cámara. Puede que no sea compatible con las resoluciones solicitadas.");
                    break;
            }
            currentState = AppState.INIT;
            updateUIForState();
        }
    }

    function showMessage(text) { messageDiv.textContent = text || ""; }

    // --- Event Handlers (con cambios menores) ---
    primaryActionBtn.addEventListener('click', () => {
        switch (currentState) {
            case AppState.INIT:
                showMessage("¡Todo listo! A continuación, tu navegador te pedirá permiso para usar la cámara. Por favor, selecciona 'Permitir'.");
                setTimeout(startCamera, 100);
                break;
            // El resto de los casos no cambian
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
        cameraSelect.innerHTML = ''; // Limpia el selector de cámaras
        currentState = AppState.INIT;
        updateUIForState();
    });

    // --- MODIFICADO: El evento 'change' ahora simplemente llama a startCamera. ---
    cameraSelect.addEventListener('change', startCamera);

    docType.addEventListener('change', () => {
        const doc = docType.value;
        overlay.classList.toggle('overlay-ine', doc === 'ine' || doc === 'license' || doc === 'old_citizen');
        overlay.classList.toggle('overlay-passport', doc === 'passport');
    });

    window.addEventListener('resize', checkOrientation);

    // --- Inicialización (se elimina la llamada inicial a getCameras) ---
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
