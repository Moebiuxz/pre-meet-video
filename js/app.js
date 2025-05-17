document.addEventListener('DOMContentLoaded', () => {
    // Elementos DOM
    const videoElement = document.getElementById('video-preview');
    const videoContainer = document.querySelector('.video-container');
    const noVideoElement = document.querySelector('.no-video');
    const audioMeterFill = document.getElementById('audio-meter-fill');
    const connectionStatus = document.getElementById('connection-status');
    const cameraStatus = document.getElementById('camera-status');
    const micStatus = document.getElementById('mic-status');
    const retryButton = document.getElementById('retry-button');
    const continueButton = document.getElementById('continue-button');
    const deviceSelector = document.getElementById('device-selector');
    const cameraSelect = document.getElementById('camera-select');
    const microphoneSelect = document.getElementById('microphone-select');
    const statusMessage = document.getElementById('status-message');
    const permissionPrompt = document.getElementById('permission-prompt');
    const requestPermissionButton = document.getElementById('request-permission-button');
    const toggleVideoMirrorButton = document.getElementById('toggle-video-mirror');
    const toggleVideoFitButton = document.getElementById('toggle-video-fit');
    const audioOnlyButton = document.getElementById('audio-only-button');
    const tryAlternateCameraButton = document.getElementById('try-alternate-camera');
    
    // Estado de las pruebas
    const testState = {
        connection: 'pending',
        camera: 'pending',
        microphone: 'pending'
    };
    
    // Exponer el estado de las pruebas globalmente
    window.testState = testState;
    
    // Referencias para limpiar recursos
    let mediaStream = null;
    let audioContext = null;
    let audioAnalyser = null;
    let audioDataArray = null;
    let audioMeterInterval = null;
    
    // Configuración de timeout para getUserMedia
    const MEDIA_TIMEOUT = 15000; // 15 segundos
    let mediaTimeoutId = null;
    
    // Mantener un registro de los dispositivos disponibles
    let availableCameras = [];
    let availableMicrophones = [];
    
    // Iniciar solo la prueba de conexión al principio
    // No iniciaremos las pruebas de medios hasta que el usuario dé permiso
    permissionPrompt.style.display = 'flex';
    testConnection();
    
    // Evento para solicitar permisos explícitamente
    requestPermissionButton.addEventListener('click', () => {
        permissionPrompt.style.display = 'none';
        startMediaTests();
    });
    
    // Evento para reintentar las pruebas
    retryButton.addEventListener('click', () => {
        resetTests();
        testConnection();
        permissionPrompt.style.display = 'flex';
    });
    
    // Evento para cambiar dispositivos
    cameraSelect.addEventListener('change', () => {
        if (cameraSelect.value) {
            switchCamera(cameraSelect.value);
        }
    });
    
    microphoneSelect.addEventListener('change', () => {
        if (microphoneSelect.value) {
            switchMicrophone(microphoneSelect.value);
        }
    });
    
    // Evento para continuar (en implementación local)
    continueButton.addEventListener('click', () => {
        alert('Todos los dispositivos están listos. En una integración real, esto te llevaría a la videollamada.');
    });
    
    // Eventos para controles de video
    toggleVideoMirrorButton.addEventListener('click', () => {
        videoContainer.classList.toggle('mirrored');
    });
    
    toggleVideoFitButton.addEventListener('click', () => {
        videoContainer.classList.toggle('contain');
        const icon = toggleVideoFitButton.querySelector('i');
        if (videoContainer.classList.contains('contain')) {
            icon.className = 'fas fa-compress';
        } else {
            icon.className = 'fas fa-expand';
        }
    });
    
    // Evento para probar solo con audio
    audioOnlyButton.addEventListener('click', () => {
        permissionPrompt.style.display = 'none';
        testAudioOnly();
    });
    
    // Evento para probar con cámara alternativa
    tryAlternateCameraButton.addEventListener('click', () => {
        permissionPrompt.style.display = 'none';
        testAlternateCamera();
    });
    
    // Función para iniciar las pruebas de medios
    function startMediaTests() {
        updateGlobalStatus('pending', 'Verificando dispositivos y conexión...');
        testMediaDevices();
    }
    
    // Obtener lista de dispositivos disponibles
    function getAvailableDevices() {
        // Limpiar listas actuales
        availableCameras = [];
        availableMicrophones = [];
        
        // Limpiar las opciones de los selectores
        cameraSelect.innerHTML = '';
        microphoneSelect.innerHTML = '';
        
        return navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                devices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    
                    if (device.kind === 'videoinput') {
                        option.text = device.label || `Cámara ${availableCameras.length + 1}`;
                        availableCameras.push(device);
                        cameraSelect.appendChild(option);
                    } else if (device.kind === 'audioinput') {
                        option.text = device.label || `Micrófono ${availableMicrophones.length + 1}`;
                        availableMicrophones.push(device);
                        microphoneSelect.appendChild(option);
                    }
                });
                
                // Mostrar/ocultar el selector de dispositivos según disponibilidad
                deviceSelector.style.display = (availableCameras.length > 1 || availableMicrophones.length > 1) ? 'block' : 'none';
                
                return devices;
            })
            .catch(error => {
                console.error('Error al enumerar dispositivos:', error);
                return [];
            });
    }
    
    // Función para reiniciar todas las pruebas
    function resetTests() {
        // Detener y limpiar recursos
        stopMediaStreams();
        
        // Cancelar timeout si existe
        if (mediaTimeoutId) {
            clearTimeout(mediaTimeoutId);
            mediaTimeoutId = null;
        }
        
        // Reiniciar estados visuales
        updateStatusElement('connection', 'pending');
        updateStatusElement('camera', 'pending');
        updateStatusElement('microphone', 'pending');
        updateGlobalStatus('pending', 'Verificando dispositivos y conexión...');
        
        // Ocultar video y restablecer medidor de audio
        noVideoElement.style.display = 'flex';
        audioMeterFill.style.width = '0%';
        
        // Ocultar botón de continuar
        continueButton.style.display = 'none';
        
        // Reiniciar el estado de las pruebas
        Object.keys(testState).forEach(key => {
            testState[key] = 'pending';
        });
    }
    
    // Cambiar de cámara
    function switchCamera(deviceId) {
        // Solo cambiar si hay un stream actual
        if (!mediaStream) return;
        
        // Configurar restricciones con el nuevo deviceId
        const constraints = {
            video: { deviceId: { exact: deviceId } }
        };
        
        // Detener pistas de video actuales
        mediaStream.getVideoTracks().forEach(track => track.stop());
        
        // Obtener nuevo stream de video
        navigator.mediaDevices.getUserMedia(constraints)
            .then(newVideoStream => {
                // Reemplazar la pista de video en el stream existente
                const videoTrack = newVideoStream.getVideoTracks()[0];
                const oldVideoTracks = mediaStream.getVideoTracks();
                
                if (oldVideoTracks.length > 0) {
                    mediaStream.removeTrack(oldVideoTracks[0]);
                }
                
                mediaStream.addTrack(videoTrack);
                
                // Actualizar la vista previa
                setupVideo(mediaStream);
                noVideoElement.style.display = 'none';
                
                // Actualizar el estado
                testState.camera = 'success';
                updateStatusElement('camera', 'success', 'Cámara funcionando');
                updateGlobalStatus();
            })
            .catch(error => {
                console.error('Error al cambiar cámara:', error);
                handleDeviceError(error, 'camera');
                updateGlobalStatus();
            });
    }
    
    // Cambiar de micrófono
    function switchMicrophone(deviceId) {
        // Solo cambiar si hay un stream actual
        if (!mediaStream) return;
        
        // Configurar restricciones con el nuevo deviceId
        const constraints = {
            audio: { deviceId: { exact: deviceId } }
        };
        
        // Detener pistas de audio actuales
        mediaStream.getAudioTracks().forEach(track => track.stop());
        
        // Detener el medidor de audio actual
        if (audioMeterInterval) {
            clearInterval(audioMeterInterval);
            audioMeterInterval = null;
        }
        
        // Cerrar el contexto de audio actual
        if (audioContext && audioContext.state !== 'closed') {
            try {
                audioContext.close();
            } catch (err) {
                console.error('Error al cerrar AudioContext:', err);
            }
        }
        
        // Obtener nuevo stream de audio
        navigator.mediaDevices.getUserMedia(constraints)
            .then(newAudioStream => {
                // Reemplazar la pista de audio en el stream existente
                const audioTrack = newAudioStream.getAudioTracks()[0];
                const oldAudioTracks = mediaStream.getAudioTracks();
                
                if (oldAudioTracks.length > 0) {
                    mediaStream.removeTrack(oldAudioTracks[0]);
                }
                
                mediaStream.addTrack(audioTrack);
                
                // Configurar nuevo medidor de audio
                setupAudioMeter(newAudioStream);
                
                // Actualizar el estado
                testState.microphone = 'success';
                updateStatusElement('microphone', 'success', 'Micrófono funcionando');
                updateGlobalStatus();
            })
            .catch(error => {
                console.error('Error al cambiar micrófono:', error);
                handleDeviceError(error, 'microphone');
                updateGlobalStatus();
            });
    }
    
    // Función para probar la conexión a internet
    function testConnection() {
        updateStatusElement('connection', 'pending');
        
        const startTime = Date.now();
        const connectionTestUrl = 'https://www.google.com/generate_204';
        
        // Verificar conexión con fetch()
        fetch(connectionTestUrl, { mode: 'no-cors', cache: 'no-store' })
            .then(() => {
                const pingTime = Date.now() - startTime;
                let quality = 'success'; // Cambiado de 'good' a 'success' para consistencia
                
                if (pingTime > 300) {
                    quality = 'warning';
                }
                
                testState.connection = quality;
                let message = 'Conectado';
                
                if (quality === 'warning') {
                    message += ` (ping: ${pingTime}ms)`;
                }
                
                updateStatusElement('connection', quality, message);
                updateGlobalStatus();
            })
            .catch(error => {
                console.error('Error de conexión:', error);
                testState.connection = 'error';
                updateStatusElement('connection', 'error', 'Sin conexión');
                updateGlobalStatus();
            });
    }
    
    // Helper function to log video track information
    function logVideoTrackInfo(stream, attemptName) {
        if (!stream) {
            console.warn(`logVideoTrackInfo: Stream nulo para ${attemptName}`);
            return;
        }
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0 && videoTracks[0]) {
            const settings = videoTracks[0].getSettings();
            console.log(`Info. cámara (${attemptName}):`, settings);
            if (settings.width && settings.height) {
                 console.log(`Resolución obtenida (${attemptName}): ${settings.width}x${settings.height}`);
            }
        } else {
            console.warn(`Video stream (${attemptName}) no tiene pistas de video activas o la pista es nula.`);
        }
    }

    // Modificar la función testMediaDevices para la nueva estrategia de intentos
    function testMediaDevices() {
        updateStatusElement('camera', 'pending');
        updateStatusElement('microphone', 'pending');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            handleDeviceError({ name: 'NotSupportedError' }, 'camera');
            handleDeviceError({ name: 'NotSupportedError' }, 'microphone');
            updateGlobalStatus();
            return;
        }

        let audioStreamInternal = null; 
        let videoStreamInternal = null;

        const MEDIA_ATTEMPTS = [
            { 
                name: "AudioVideo Combinado (Ideal)", 
                constraints: { 
                    audio: true, 
                    video: { 
                        width: { ideal: 1280 }, 
                        height: { ideal: 720 }, 
                        frameRate: { ideal: 30 } 
                    } 
                }, 
                type: 'audiovideo' 
            },
            { 
                name: "AudioVideo Combinado (640x480)", 
                constraints: { 
                    audio: true, 
                    video: { 
                        width: { ideal: 640 }, 
                        height: { ideal: 480 }, 
                        frameRate: { ideal: 24 } 
                    } 
                }, 
                type: 'audiovideo' 
            },
            { 
                name: "AudioVideo Combinado (Genérico)", 
                constraints: { audio: true, video: true }, 
                type: 'audiovideo' 
            },
            { 
                name: "AudioOnly", 
                constraints: { audio: true, video: false }, 
                type: 'audio' 
            },
            { 
                name: "Video 1280x720 (post-audio)", 
                constraints: { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: {ideal: 30 } } }, 
                type: 'video',
                requiresAudioSuccess: true
            },
            { 
                name: "Video 640x480 (post-audio)", 
                constraints: { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: {ideal: 24 } } }, 
                type: 'video',
                requiresAudioSuccess: true 
            },
            { 
                name: "Video 320x240 (post-audio)", 
                constraints: { video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { max: 15 } } }, 
                type: 'video',
                requiresAudioSuccess: true
            },
            { 
                name: "Video Genérico (post-audio)", 
                constraints: { video: true }, 
                type: 'video',
                requiresAudioSuccess: true
            } 
        ];

        let currentAttemptIndex = 0;

        const clearMediaTimeout = () => {
            if (mediaTimeoutId) {
                clearTimeout(mediaTimeoutId);
                mediaTimeoutId = null;
            }
        };

        const startAttemptTimeout = (attemptName, timeoutAction) => {
            clearMediaTimeout();
            console.log(`Iniciando timeout (${MEDIA_TIMEOUT}ms) para ${attemptName}`);
            mediaTimeoutId = setTimeout(() => {
                console.warn(`Timeout esperando stream para ${attemptName}.`);
                timeoutAction(); 
            }, MEDIA_TIMEOUT);
        };

        function tryNextAttempt() {
            clearMediaTimeout();
            if (currentAttemptIndex >= MEDIA_ATTEMPTS.length) {
                console.log("Todos los intentos de obtener medios han finalizado.");
                if (testState.camera !== 'success' && testState.camera !== 'warning') {
                     handleDeviceError({name: "AllAttemptsFailed", message: "No se pudo iniciar la cámara tras varios intentos"}, "camera");
                }
                if (testState.microphone !== 'success') {
                     handleDeviceError({name: "AllAttemptsFailed", message: "No se pudo iniciar el micrófono tras varios intentos"}, "microphone");
                }
                finalizeMediaStreams();
                return;
            }

            const attempt = MEDIA_ATTEMPTS[currentAttemptIndex];
            currentAttemptIndex++;

            if (attempt.requiresAudioSuccess && testState.microphone !== 'success') {
                console.log(`Saltando intento de video '${attempt.name}' porque el audio no tuvo éxito.`);
                tryNextAttempt();
                return;
            }
            
            if (attempt.type === 'audio' && testState.microphone === 'success') {
                console.log(`Audio ya exitoso, saltando intento de solo audio '${attempt.name}'.`);
                tryNextAttempt();
                return;
            }

            if (attempt.type === 'video' && testState.camera === 'success') {
                 console.log(`Video ya exitoso, saltando intento de solo video '${attempt.name}'.`);
                 tryNextAttempt();
                 return;
            }

            console.log(`Realizando intento: ${attempt.name}`, attempt.constraints);

            startAttemptTimeout(attempt.name, () => {
                if (attempt.type === 'audiovideo' || attempt.type === 'video') {
                    if(testState.camera === 'pending') {
                        updateStatusElement('camera', 'error', `Timeout en ${attempt.name}`);
                        testState.camera = 'error_timeout_attempt';
                    }
                }
                if (attempt.type === 'audiovideo' || attempt.type === 'audio') {
                     if(testState.microphone === 'pending') {
                        updateStatusElement('microphone', 'error', `Timeout en ${attempt.name}`);
                        testState.microphone = 'error_timeout_attempt';
                     }
                }
                tryNextAttempt(); 
            });

            let constraintsToUse = { ...attempt.constraints };
            if (attempt.type === 'video' && testState.microphone === 'success') {
                constraintsToUse.audio = false; 
            }

            navigator.mediaDevices.getUserMedia(constraintsToUse)
                .then(stream => {
                    clearMediaTimeout();
                    console.log(`Éxito con ${attempt.name}`);

                    let audioProcessedThisAttempt = false;
                    let videoProcessedThisAttempt = false;

                    if (constraintsToUse.audio && stream.getAudioTracks().length > 0) {
                        if (testState.microphone !== 'success') {
                            audioStreamInternal = new MediaStream(stream.getAudioTracks().map(t => t.clone()));
                            handleAudioStream(audioStreamInternal); 
                            audioProcessedThisAttempt = true;
                        } else {
                             stream.getAudioTracks().forEach(t => t.stop());
                        }
                    }

                    if (constraintsToUse.video && stream.getVideoTracks().length > 0) {
                        if (testState.camera !== 'success') { 
                            videoStreamInternal = new MediaStream(stream.getVideoTracks().map(t => t.clone()));
                            logVideoTrackInfo(videoStreamInternal, attempt.name);
                            videoProcessedThisAttempt = true;
                        } else {
                            stream.getVideoTracks().forEach(t => t.stop());
                        }
                    }
                    
                    const canFinalize = 
                        (attempt.type === 'audiovideo' && audioProcessedThisAttempt && videoProcessedThisAttempt) ||
                        (attempt.type === 'audiovideo' && audioProcessedThisAttempt && testState.camera === 'success') ||
                        (attempt.type === 'audiovideo' && videoProcessedThisAttempt && testState.microphone === 'success') ||
                        (attempt.type === 'audio' && audioProcessedThisAttempt && (testState.camera === 'success' || !MEDIA_ATTEMPTS.some(a => a.type === 'video' && a.requiresAudioSuccess))) ||
                        (attempt.type === 'video' && videoProcessedThisAttempt && testState.microphone === 'success');

                    if (canFinalize || (testState.camera === 'success' && testState.microphone === 'success')) {
                         console.log(`Condiciones para finalizar cumplidas tras '${attempt.name}'.`);
                         finalizeMediaStreams();
                    } else {
                        tryNextAttempt();
                    }
                })
                .catch(error => {
                    clearMediaTimeout();
                    console.warn(`Fallo con ${attempt.name}:`, error.name, error.message);
                    if (attempt.type === 'audiovideo') {
                        if (constraintsToUse.video && (testState.camera === 'pending' || testState.camera === 'error_timeout_attempt')) {
                            handleDeviceError(error, 'camera');
                        }
                        if (constraintsToUse.audio && (testState.microphone === 'pending' || testState.microphone === 'error_timeout_attempt')) {
                            handleDeviceError(error, 'microphone');
                        }
                    } else if (attempt.type === 'audio') {
                        handleDeviceError(error, 'microphone');
                    } else if (attempt.type === 'video') {
                        handleDeviceError(error, 'camera');
                    }
                    tryNextAttempt();
                });
        }

        function finalizeMediaStreams() {
            clearMediaTimeout();
            console.log("FinalizeMediaStreams: Procesando streams finales...");
            
            let finalCombinedStream = null;
            let audioFinalized = false;
            let videoFinalized = false;

            if (testState.microphone === 'success' && audioStreamInternal && audioStreamInternal.getAudioTracks().some(t=>t.readyState === 'live')) {
                 if (!finalCombinedStream) finalCombinedStream = new MediaStream();
                 audioStreamInternal.getAudioTracks().forEach(track => finalCombinedStream.addTrack(track));
                 console.log("Pistas de audio añadidas al stream final combinado.");
                 audioFinalized = true;
            } else if (testState.microphone !== 'success' && testState.microphone !== 'error_timeout_attempt') {
                handleDeviceError({name:"NoAudioStream", message:"Micrófono no disponible después de los intentos"}, "microphone");
            }

            if (videoStreamInternal && videoStreamInternal.getVideoTracks().some(t=>t.readyState === 'live')) {
                if (testState.camera !== 'success') {
                    updateStatusElement('camera', 'success', 'Cámara funcionando');
                    testState.camera = 'success';
                }
                if (!finalCombinedStream) finalCombinedStream = new MediaStream();
                videoStreamInternal.getVideoTracks().forEach(track => finalCombinedStream.addTrack(track));
                console.log("Pistas de video añadidas al stream final combinado.");
                setupVideo(finalCombinedStream, false);
                videoFinalized = true;
            } else if (testState.camera !== 'success' && testState.camera !== 'warning'  && testState.camera !== 'error_timeout_attempt') { 
                handleDeviceError({name:"NoVideoStream", message:"Cámara no disponible después de los intentos"}, "camera");
            }

            if (testState.camera !== 'success' && !videoFinalized) {
                console.log("Finalize: Video no tuvo éxito, asegurando mensaje de no video.");
                noVideoElement.innerHTML = '<i class="fas fa-video-slash"></i><p>No se pudo iniciar la cámara.</p>';
                noVideoElement.style.display = 'flex';
                if (testState.microphone === 'success' && testState.camera !== 'success' && testState.camera !== 'warning') {
                }
            }
            
            if (window.mediaStream) {
                window.mediaStream.getTracks().forEach(track => track.stop());
            }
            window.mediaStream = finalCombinedStream;

            updateGlobalStatus();
            setTimeout(() => getAvailableDevices(), 500);
        }

        tryNextAttempt();
    }
    
    // Manejar stream de audio
    function handleAudioStream(stream) {
        const audioTracks = stream.getAudioTracks();
        
        if (audioTracks.length > 0) {
            testState.microphone = 'success';
            updateStatusElement('microphone', 'success', 'Micrófono funcionando');
            
            // Guardar el stream si es el primero
            if (!mediaStream) {
                mediaStream = stream;
            }
            
            // Iniciar visualización del nivel de audio
            setupAudioMeter(stream);
            
            // Obtener información del dispositivo
            const audioTrackSettings = audioTracks[0].getSettings();
            console.log('Información del micrófono:', audioTrackSettings);
        }
    }
    
    // Manejar errores de dispositivo
    function handleDeviceError(error, deviceType) {
        let errorMessage = '';
        console.error(`Error con ${deviceType}:`, error.name, error.message);

        switch (error.name) {
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                errorMessage = `No se encontró ${deviceType === 'camera' ? 'cámara' : 'micrófono'}`;
                break;
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                errorMessage = 'Permiso denegado';
                permissionPrompt.style.display = 'flex';
                break;
            case 'NotReadableError':
            case 'TrackStartError':
                errorMessage = `Error del sistema al leer ${deviceType === 'camera' ? 'la cámara' : 'el micrófono'}`;
                break;
            case 'OverconstrainedError':
                errorMessage = 'Restricciones no compatibles';
                break;
            case 'TypeError':
                errorMessage = 'Error de configuración interna';
                break;
            case 'AbortError':
                errorMessage = `Se canceló el acceso a ${deviceType === 'camera' ? 'la cámara' : 'el micrófono'}`;
                break;
            case 'TimeoutError': // Error de timeout personalizado
                 errorMessage = error.message || `Tiempo de espera agotado para ${deviceType}`;
                 break;
            case 'NotSupportedError':
                errorMessage = 'Funcionalidad no compatible con este navegador.';
                break;
            default:
                errorMessage = `Error desconocido: ${error.message || error.name}`;
        }
        
        testState[deviceType] = 'error';
        updateStatusElement(deviceType, 'error', errorMessage);
    }
    
    // Configurar el medidor de audio
    function setupAudioMeter(stream) {
        try {
            // Crear el contexto de audio
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
            
            // Crear un analizador de audio
            audioAnalyser = audioContext.createAnalyser();
            audioAnalyser.fftSize = 256;
            audioAnalyser.smoothingTimeConstant = 0.8;
            
            // Crear fuente de audio desde el stream
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(audioAnalyser);
            
            // Preparar el array para los datos de audio
            audioDataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
            
            // Actualizar el medidor de audio periódicamente
            audioMeterInterval = setInterval(updateAudioMeter, 100);
        } catch (error) {
            console.error('Error al configurar el medidor de audio:', error);
            testState.microphone = 'warning';
            updateStatusElement('microphone', 'warning', 'Micrófono activo, pero no se puede visualizar el nivel');
            updateGlobalStatus();
        }
    }
    
    // Actualizar la visualización del medidor de audio
    function updateAudioMeter() {
        if (!audioAnalyser || !audioDataArray) return;
        
        // Obtener datos de volumen actual
        audioAnalyser.getByteFrequencyData(audioDataArray);
        
        // Calcular el volumen promedio
        let sum = 0;
        for (let i = 0; i < audioDataArray.length; i++) {
            sum += audioDataArray[i];
        }
        const average = sum / audioDataArray.length;
        
        // Convertir a porcentaje (max 100)
        const volume = Math.min(100, average * 2);
        
        // Actualizar el medidor visual
        audioMeterFill.style.width = `${volume}%`;
        
        // Cambiar color según el nivel
        if (volume < 5) {
            audioMeterFill.style.backgroundColor = 'var(--error-color)';
        } else if (volume < 20) {
            audioMeterFill.style.backgroundColor = 'var(--warning-color)';
        } else {
            audioMeterFill.style.backgroundColor = 'var(--success-color)';
        }
    }
    
    // Actualizar el estado global y mensaje
    function updateGlobalStatus(forceStatus, forceMessage) {
        let overallStatus = forceStatus || calculateOverallStatus();
        let statusTextMap = {
            'success': 'Todos los dispositivos están funcionando correctamente',
            'warning': 'Hay advertencias. Puede continuar pero quizás tenga problemas',
            'error': 'Hay problemas con algunos dispositivos',
            'pending': 'Verificando dispositivos y conexión...'
        };
        
        // Actualizar el mensaje de estado global
        const statusText = forceMessage || statusTextMap[overallStatus];
        statusMessage.className = 'status-message ' + (overallStatus !== 'pending' ? overallStatus : '');
        statusMessage.querySelector('p').textContent = statusText;
        
        // Mostrar/ocultar botón de continuar
        continueButton.style.display = 
            (overallStatus === 'success' || overallStatus === 'warning') ? 'block' : 'none';
    }
    
    // Calcular estado general basado en los estados individuales
    function calculateOverallStatus() {
        if (Object.values(testState).includes('pending')) {
            return 'pending';
        }
        
        if (Object.values(testState).includes('error')) {
            return 'error';
        }
        
        if (Object.values(testState).includes('warning')) {
            return 'warning';
        }
        
        return 'success';
    }
    
    // Detener y limpiar recursos de medios
    function stopMediaStreams() {
        // Detener el intervalo del medidor de audio
        if (audioMeterInterval) {
            clearInterval(audioMeterInterval);
            audioMeterInterval = null;
        }
        
        // Cerrar el contexto de audio
        if (audioContext && audioContext.state !== 'closed') {
            try {
                audioContext.close();
            } catch (err) {
                console.error('Error al cerrar AudioContext:', err);
            }
        }
        
        // Limpiar referencias
        audioAnalyser = null;
        audioDataArray = null;
        audioContext = null;
        
        // Detener todas las pistas de medios
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => {
                try {
                    track.stop();
                } catch (err) {
                    console.error('Error al detener pista de medios:', err);
                }
            });
            mediaStream = null;
        }
        
        // Limpiar elemento de video
        if (videoElement.srcObject) {
            videoElement.srcObject = null;
        }
    }
    
    // Actualizar elementos de estado visual
    function updateStatusElement(testName, status, message) {
        const statusElements = {
            'connection': {
                textElement: connectionStatus,
                iconContainer: document.querySelector('#connection-test .status-icon')
            },
            'camera': {
                textElement: cameraStatus,
                iconContainer: document.querySelector('#camera-test .status-icon')
            },
            'microphone': {
                textElement: micStatus,
                iconContainer: document.querySelector('#microphone-test .status-icon')
            }
        };
        
        const statusIcons = {
            'pending': '<i class="fas fa-spinner fa-spin"></i>',
            'success': '<i class="fas fa-check-circle status-success"></i>',
            'warning': '<i class="fas fa-exclamation-triangle status-warning"></i>',
            'error': '<i class="fas fa-times-circle status-error"></i>'
        };
        
        const statusMessages = {
            'pending': 'Comprobando...',
            'success': 'Funcionando correctamente',
            'warning': 'Funcionando con advertencias',
            'error': 'Error al comprobar'
        };
        
        // Obtener los elementos para el test específico
        const elements = statusElements[testName];
        if (!elements) return;
        
        // Actualizar el texto del estado
        elements.textElement.textContent = message || statusMessages[status];
        
        // Actualizar el icono de estado
        elements.iconContainer.innerHTML = statusIcons[status];
    }
    
    // Manejar eventos de visibilidad para pausar/reanudar pruebas
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // La página está oculta, pausar recursos
            stopMediaStreams();
        } else {
            // La página es visible de nuevo, reiniciar pruebas
            testConnection();
            // No iniciamos las pruebas de medios automáticamente al volver a la página
        }
    });

    // Iniciar verificación de estado del video periódicamente
    const videoDebugInterval = setInterval(() => {
        if (videoElement && videoElement.videoWidth) {
            console.log('Dimensiones actuales del video:', videoElement.videoWidth, 'x', videoElement.videoHeight);
            console.log('Tiempo de video transcurrido:', videoElement.currentTime);
            if (videoElement.paused) {
                console.log('¡El video está pausado! Intentando reproducir...');
                videoElement.play().catch(e => console.error('Error al reproducir video en interval:', e));
            }
            // Detener este intervalo después de 5 verificaciones exitosas
            if (videoElement.currentTime > 1) {
                clearInterval(videoDebugInterval);
            }
        } else if (videoElement) {
            console.log('Sin dimensiones de video aún. readyState:', videoElement.readyState);
        }
    }, 1000);

    // Modificar la función setupVideo para diagnósticos más detallados
    function setupVideo(stream, alternateMode = false) {
        console.log("setupVideo: Iniciando configuración de video.");

        if (!stream) {
            console.error('setupVideo: No se proporcionó stream.');
            testState.camera = 'error';
            updateStatusElement('camera', 'error', 'Error interno: stream nulo');
            noVideoElement.innerHTML = '<i class="fas fa-video-slash"></i><p>Error interno (stream nulo).</p>';
            noVideoElement.style.display = 'flex';
            updateGlobalStatus();
            return;
        }
        
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0 || !videoTracks.some(track => track.readyState === 'live')) {
            console.error('setupVideo: No hay pistas de video activas en el stream.', videoTracks);
            testState.camera = 'error';
            updateStatusElement('camera', 'error', 'No se detectó señal de video');
            noVideoElement.innerHTML = '<i class="fas fa-video-slash"></i><p>No se detectó señal de video válida.</p>';
            noVideoElement.style.display = 'flex';
            updateGlobalStatus();
            return;
        }
        
        const currentVideoTrack = videoTracks.find(track => track.readyState === 'live');
        if (!currentVideoTrack) {
            console.error('setupVideo: No se encontró ninguna pista de video \'live\'.', videoTracks);
            testState.camera = 'error';
            updateStatusElement('camera', 'error', 'Pista de video no disponible');
            noVideoElement.innerHTML = '<i class="fas fa-video-slash"></i><p>Pista de video no disponible.</p>';
            noVideoElement.style.display = 'flex';
            updateGlobalStatus();
            return;
        }

        console.log('setupVideo: Configurando video con pista:', currentVideoTrack.label);
        console.log('setupVideo: Configuración de pista:', currentVideoTrack.getSettings());
        console.log('setupVideo: Estado del videoElement ANTES de srcObject:', 
                    `paused: ${videoElement.paused}, readyState: ${videoElement.readyState}, networkState: ${videoElement.networkState}, error: ${videoElement.error}` );

        videoContainer.classList.toggle('mirrored', true); // Espejo por defecto
        videoContainer.classList.toggle('contain', alternateMode);
        
        try {
            // Limpiar el srcObject anterior si es diferente para forzar la recarga
            if (videoElement.srcObject && videoElement.srcObject !== stream) {
                console.log("setupVideo: Limpiando srcObject anterior.");
                videoElement.pause();
                videoElement.srcObject = null; 
            }
            
            videoElement.style.display = 'block';
            videoElement.muted = true; // Esencial para autoplay en muchos navegadores
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.srcObject = stream; // Asignar el stream
            
            videoElement.onloadedmetadata = () => {
                console.log('setupVideo: Evento onloadedmetadata. Dimensiones:', videoElement.videoWidth, 'x', videoElement.videoHeight);
                console.log('setupVideo: Estado del videoElement en onloadedmetadata:', 
                            `paused: ${videoElement.paused}, readyState: ${videoElement.readyState}, networkState: ${videoElement.networkState}, error: ${videoElement.error}` );
                
                if (videoElement.paused) {
                    console.log("setupVideo: Video pausado en onloadedmetadata. Intentando play().");
                    videoElement.play()
                        .then(() => {
                            console.log('setupVideo: Play() exitoso después de onloadedmetadata.');
                            // noVideoElement.style.display = 'none'; // Se maneja en onplaying
                        })
                        .catch(err => {
                            console.error('setupVideo: Error en play() después de onloadedmetadata:', err);
                            noVideoElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Error al reproducir video.</p>';
                            noVideoElement.style.display = 'flex';
                        });
                } else {
                    console.log("setupVideo: Video ya reproduciendo o listo para reproducir en onloadedmetadata.");
                    noVideoElement.style.display = 'none';
                    toggleVideoMirrorButton.disabled = false;
                    toggleVideoFitButton.disabled = false;
                }
            };
            
            videoElement.onplaying = () => {
                console.log('setupVideo: Evento onplaying disparado. El video se está reproduciendo.');
                noVideoElement.style.display = 'none';
                toggleVideoMirrorButton.disabled = false;
                toggleVideoFitButton.disabled = false;
            };
            
            videoElement.onstalled = () => {
                console.warn("setupVideo: Evento onstalled - el video se ha atascado.");
            };

            videoElement.onsuspend = () => {
                console.warn("setupVideo: Evento onsuspend - la carga del video se ha suspendido.");
            };

            videoElement.onerror = (e) => {
                console.error('setupVideo: Error en el elemento de video:', videoElement.error, e);
                testState.camera = 'error';
                updateStatusElement('camera', 'error', `Error de video: ${videoElement.error?.message || 'desconocido'}` );
                noVideoElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Error al mostrar el video.</p>';
                noVideoElement.style.display = 'flex';
                updateGlobalStatus();
            };
            
            // Si el estado de la cámara no se marcó como éxito antes (ej. en testMediaDevices), marcarlo ahora.
            if(testState.camera !== 'success'){
                 testState.camera = alternateMode ? 'warning' : 'success'; // Usar warning si es modo alternativo
                 updateStatusElement('camera', testState.camera, 
                                alternateMode ? 'Cámara funcionando (modo alternativo)' : 'Cámara funcionando');
            }
            updateGlobalStatus(); // Actualiza el estado general que puede mostrar el botón Continuar
            
            // Intentar reproducir inmediatamente, no solo esperar a onloadedmetadata
            console.log("setupVideo: Intentando play() inmediatamente después de asignar srcObject.");
            videoElement.play().then(() => {
                console.log("setupVideo: Play() inmediato tuvo éxito.");
                 // noVideoElement.style.display = 'none'; // Se maneja en onplaying
            }).catch(e => {
                console.warn('setupVideo: Play() inmediato falló (esto puede ser normal, esperando metadata):', e.name, e.message);
            });
            
            console.log("setupVideo: Configuración finalizada.");

        } catch (err) {
            console.error('setupVideo: Excepción durante la configuración del video:', err);
            testState.camera = 'error';
            updateStatusElement('camera', 'error', 'Excepción al configurar video: ' + err.message);
            noVideoElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Excepción al configurar video.</p>';
            noVideoElement.style.display = 'flex';
            updateGlobalStatus();
        }
    }

    // Función para probar solo con audio
    function testAudioOnly() {
        updateStatusElement('camera', 'pending');
        updateStatusElement('microphone', 'pending');
        
        console.log("Probando solo con audio...");
        
        navigator.mediaDevices.getUserMedia({ 
            audio: true,
            video: false
        })
        .then(audioStream => {
            console.log("Audio obtenido correctamente en modo audio-only");
            
            // Guardar stream
            mediaStream = audioStream;
            
            // Procesar audio
            const audioTracks = audioStream.getAudioTracks();
            if (audioTracks.length > 0) {
                testState.microphone = 'success';
                updateStatusElement('microphone', 'success', 'Micrófono funcionando');
                setupAudioMeter(audioStream);
            }
            
            // Marcar la cámara como no disponible
            testState.camera = 'warning';
            updateStatusElement('camera', 'warning', 'Modo audio solamente (sin cámara)');
            
            // Actualizar estado global
            updateGlobalStatus();
            
            // Mostrar mensaje en contenedor de video
            noVideoElement.innerHTML = '<i class="fas fa-microphone"></i><p>Modo solo audio</p>';
            noVideoElement.style.display = 'flex';
            
            // Obtener lista de dispositivos
            setTimeout(() => getAvailableDevices(), 1000);
        })
        .catch(error => {
            console.error("Error al obtener audio en modo audio-only:", error);
            
            testState.microphone = 'error';
            updateStatusElement('microphone', 'error', 'No se pudo acceder al micrófono: ' + error.message);
            
            testState.camera = 'warning';
            updateStatusElement('camera', 'warning', 'Modo audio solamente (sin cámara)');
            
            updateGlobalStatus();
            
            // Mostrar el prompt de nuevo
            permissionPrompt.style.display = 'flex';
        });
    }
    
    // Función para probar con configuración alternativa de cámara
    function testAlternateCamera() {
        updateStatusElement('camera', 'pending');
        updateStatusElement('microphone', 'pending');
        
        console.log("Probando con configuración alternativa de cámara...");
        
        // Usar configuración minimalista
        const constraints = {
            audio: true,
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { max: 10 }
            }
        };
        
        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                console.log("Stream obtenido con configuración alternativa");
                
                // Guardar stream
                mediaStream = stream;
                
                // Procesar audio
                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    testState.microphone = 'success';
                    updateStatusElement('microphone', 'success', 'Micrófono funcionando');
                    setupAudioMeter(stream);
                }
                
                // Configurar video con modo especial
                setupVideo(stream, true);
                
                // Actualizar estado de cámara
                testState.camera = 'success';
                updateStatusElement('camera', 'success', 'Cámara funcionando (modo alternativo)');
                
                // Actualizar estado global
                updateGlobalStatus();
                
                // Obtener lista de dispositivos
                setTimeout(() => getAvailableDevices(), 1000);
            })
            .catch(error => {
                console.error("Error al obtener medios con configuración alternativa:", error);
                
                // Intentar solo con audio como respaldo
                testAudioOnly();
            });
    }
}); 