/* global ethers */
import './wallet.js';                            // boots nav button
import {
    NFT_ABI, USDC_ABI, CONTRACT_ADDRESS, USDC_ADDRESS
} from './config.js';
import {
    browserProvider, rpcProvider,
    connectWallet, short
} from './wallet.js';

// Enhanced provider configuration with comprehensive details
const providers = {
    'dall-e': {
        name: 'DALL-E 3',
        icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.6174zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.5097-2.6067-1.4998z"/></svg>',
        description: 'OpenAI\'s most advanced text-to-image model with exceptional detail and artistic flair.',
        supportedModels: ['dall-e-3', 'dall-e-2'],
        advantages: [
            'Highest quality image generation',
            'Superior prompt understanding',
            'Excellent for detailed characters',
            'Great consistency in style',
            'Avoids artifacts'
        ],
        options: {
            model: {
                'dall-e-3': 'Latest and highest quality',
                'dall-e-2': 'Faster, lower cost'
            },
            quality: {
                'hd': 'Higher detail, more precision',
                'standard': 'Balanced quality and speed'
            },
            style: {
                'vivid': 'Vibrant, high-contrast images',
                'natural': 'More realistic, subdued tones'
            }
        }
    },
    'stability': {
        name: 'Stability AI',
        icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M5.53 3h2.12l.61 1.37h-1.2V8.6h-1.5V4.37h-.65L5.53 3M9.5 4.7h1.41v1.15H9.5V8.6H8.03V3h3.63l.61 1.37h-2.77v.33M16.38 3h2.12l.61 1.37h-1.2v3.57h-1.5V4.37h-.64L16.38 3M3 9.5h18v1.4H3zM20.5 15v-1h-17v1H14v2.14H3V16h5.03v-1H3v-1h18v1h-5v1H21v1.14H16V15z"></path></svg>',
        description: 'Creator of Stable Diffusion, offering precise control over artistic output.',
        supportedModels: ['stable-diffusion-xl-1024-v1-0'],
        advantages: [
            'Creative and stylistic flexibility',
            'Strong artistic interpretation',
            'Style preset options',
            'Good with abstract concepts',
            'Fast generation times'
        ],
        options: {
            stylePreset: {
                'pixel-art': 'Classic pixelated gaming style',
                'anime': 'Japanese anime/manga style',
                '3d-model': '3D rendered appearance',
                'photographic': 'Realistic photo-like quality',
                'digital-art': 'Modern digital illustration style'
            }
        }
    },
    'huggingface': {
        name: 'HuggingFace',
        icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11.9998 1.96875C10.9614 1.93058 9.93064 2.14784 9 2.59375C8.60171 2.79522 8.23442 3.04853 7.90625 3.34375C7.40337 3.10502 6.83948 3 6.25 3C4.45875 3 3 4.45875 3 6.25C3 6.83948 3.10502 7.40337 3.34375 7.90625C2.55288 8.96291 2.0625 10.3636 2.0625 11.9062C2.0625 15.3893 4.79808 18.125 8.28125 18.125C8.5707 18.125 8.85496 18.1095 9.13281 18.0781C9.71132 19.8058 11.3354 21 13.25 21C15.1646 21 16.7887 19.8058 17.3672 18.0781C17.645 18.1095 17.9293 18.125 18.2188 18.125C21.7019 18.125 24.4375 15.3893 24.4375 11.9062C24.4375 10.3636 23.9471 8.96291 23.1562 7.90625C23.395 7.40337 23.5 6.83948 23.5 6.25C23.5 4.45875 22.0412 3 20.25 3C19.6605 3 19.0966 3.10502 18.5938 3.34375C18.2656 3.04853 17.8983 2.79522 17.5 2.59375C16.5694 2.14784 15.5386 1.93058 14.5002 1.96875C13.4221 2.00813 12.9998 1.99409 11.9998 1.96875M12 3.03125C12.982 3.05622 13.458 3.0775 14.4998 3.03906C15.3945 3.00681 16.2783 3.17345 17.0938 3.5625C17.6211 3.81938 18.0536 4.19008 18.375 4.625C18.5359 4.85324 18.7299 5.17537 18.625 5.375C18.539 5.52573 18.2895 5.55346 18.0312 5.5625C17.3869 5.58688 16.5155 5.59375 15 5.59375C13.5335 5.59375 12.1091 5.86459 11.0312 6.40625C9.95335 6.94791 9.1875 7.78226 9.1875 9.0625C9.1875 10.9092 10.5339 12.25 12.5 12.25C14.0318 12.25 15.2891 11.2304 15.7812 9.78125H16.875V14.625C16.875 16.4213 15.7413 17.8438 14.4062 17.8438C13.0712 17.8438 12 16.4213 12 14.625M7.09375 4.15625C7.48243 4.43632 7.82436 4.78262 8.09375 5.1875C8.29159 5.47986 8.58102 5.91769 8.40625 6.15625C8.28165 6.3388 7.88522 6.35289 7.53125 6.3125C6.90739 6.23794 6.2383 6.09375 5.46875 6.09375C4.63587 6.09375 3.90625 6.26386 3.90625 6.26562C3.87512 6.23856 3.83669 6.22325 3.8125 6.1875C3.81213 6.18708 3.78125 6.125 3.78125 6.125C3.78125 5.00809 4.70573 4.08125 5.8125 4.08125C6.34045 4.08125 6.76462 4.28001 7.09375 4.15625M18.4062 4.15625C18.7354 4.28001 19.1595 4.08125 19.6875 4.08125C20.7943 4.08125 21.7188 5.00809 21.7188 6.125C21.7188 6.125 21.6879 6.18708 21.6875 6.1875C21.6633 6.22325 21.6249 6.23856 21.5938 6.26562C21.5938 6.26386 20.8641 6.09375 20.0312 6.09375C19.2617 6.09375 18.5926 6.23794 17.9688 6.3125C17.6148 6.35289 17.2183 6.3388 17.0938 6.15625C16.919 5.91769 17.2084 5.47986 17.4062 5.1875C17.6756 4.78262 18.0176 4.43632 18.4062 4.15625M14.4062 13.9688C15.0654 13.9688 15.5938 14.4971 15.5938 15.1562C15.5938 15.8154 15.0654 16.3438 14.4062 16.3438C13.7471 16.3438 13.2188 15.8154 13.2188 15.1562C13.2188 14.4971 13.7471 13.9688 14.4062 13.9688M7.40625 5.5C7.7649 5.5 8.09071 5.58106 8.38437 5.70312C8.48937 5.74662 8.59335 5.80125 8.69531 5.85938C8.69531 5.85938 8.1875 5.875 7.8125 5.875C7.39436 5.875 6.92304 5.81783 6.48438 5.75C6.77384 5.59242 7.08011 5.5 7.40625 5.5M18.0938 5.5C18.4199 5.5 18.7261 5.59242 19.0156 5.75C18.577 5.81783 18.1056 5.875 17.6875 5.875C17.3125 5.875 16.8047 5.85938 16.8047 5.85938C16.9066 5.80125 17.0106 5.74662 17.1156 5.70312C17.4093 5.58106 17.7351 5.5 18.0938 5.5M12.5 8.09375C13.5409 8.09375 14.375 8.75646 14.375 9.625C14.375 10.4935 13.5409 11.1562 12.5 11.1562C11.4591 11.1562 10.625 10.4935 10.625 9.625C10.625 8.75646 11.4591 8.09375 12.5 8.09375M7.40625 9.53125C7.40625 11.9489 9.29074 13.9062 11.8125 13.9062C12.0384 13.9062 12.2709 13.9007 12.5 13.875C12.8091 13.8422 12.9639 13.6035 12.9375 13.375C12.9159 13.1905 12.7886 13.0474 12.625 12.9375C12.2761 12.6731 12.0334 12.2698 12 11.8125C11.989 11.6389 12.0413 11.4998 12 11.3438C11.9288 11.0806 11.6449 10.977 11.375 11C11.1051 11.023 10.8563 10.9806 10.625 10.8125C10.1624 10.4764 9.96875 9.85614 9.96875 9.1875C9.96875 8.79027 10.0606 8.34722 10.25 7.96875C10.4394 7.59028 10.7401 7.24306 11.125 7C11.2793 6.90521 11.3079 6.74963 11.2812 6.625C11.2545 6.50037 11.1839 6.40918 11.0312 6.375C11.0107 6.36958 10.9934 6.37052 10.9688 6.375C10.6617 6.43506 10.3733 6.54592 10.0938 6.6875C9.33243 7.06789 8.62339 7.69965 8.1875 8.53125C7.80834 9.25955 7.40625 10.2643 7.40625 11.7188C7.40625 13.4636 8.05176 14.7803 9.09375 15.6875C9.69661 16.2214 10.4148 16.5789 11.1875 16.75C10.4793 16.9647 9.75501 17.0938 9 17.0938C5.89221 17.0938 3.375 14.7949 3.375 11.9062C3.375 10.5324 3.84015 9.29644 4.59375 8.4375C4.83016 8.16159 4.8006 7.7394 4.53125 7.5C4.2619 7.26061 3.84065 7.30185 3.59375 7.5625C3.43732 7.73642 3.28513 7.92642 3.15625 8.125C2.71734 8.93365 2.50921 9.82306 2.53125 10.75C2.5581 11.8625 2.9339 12.8974 3.625 13.75C4.00126 14.2205 4.44859 14.6394 4.96875 15C3.54296 14.047 2.73438 12.1713 2.73438 10.2812C2.73438 8.93754 3.19357 7.77803 3.90625 6.90625C3.95733 6.84523 3.93754 6.72245 4 6.65625C4.14198 6.4999 4.45624 6.59975 4.71875 6.71875C5.96054 7.22929 7.40625 7.53125 9 7.53125C10.1628 7.53125 11.2692 7.3763 12.2812 7.09375C12.7872 6.95248 13.2714 6.78477 13.7188 6.59375C13.987 6.47557 14.4333 6.35746 14.5625 6.53125C14.6352 6.62834 14.6122 6.75394 14.5625 6.84375C14.4288 7.07662 14.2772 7.28846 14.0938 7.46875C13.8943 7.66816 13.6686 7.84396 13.4062 7.96875C13.0408 8.14252 12.5946 8.17698 12.4062 8.4375C12.3071 8.57926 12.2426 8.79376 12.2812 9C12.3261 9.24295 12.5136 9.41089 12.75 9.46875C12.9864 9.52661 13.2283 9.47994 13.4062 9.34375C14.0513 8.82744 14.5837 8.18034 14.9688 7.46875C15.0127 7.38859 15.0543 7.31636 15.0938 7.21875C15.1469 7.08515 15.0535 6.93674 15.2188 6.84375C15.4404 6.71845 15.7058 6.89635 15.9375 7C17.0868 7.48208 18.0046 8.16194 18.75 9C19.6084 9.95761 20.125 11.071 20.125 12.2812C20.125 13.1874 19.8438 14.0254 19.375 14.7188C19.0858 15.1542 18.7217 15.5401 18.3125 15.875C18.7639 15.5845 19.1495 15.2317 19.4688 14.8125C19.8885 14.2642 20.1674 13.626 20.3438 12.9688C20.5201 12.3115 20.625 11.5701 20.625 10.8125C20.625 10.2219 20.5452 9.68929 20.4062 9.15625C20.2672 8.62321 20.0698 8.08326 19.7812 7.625C19.7196 7.52738 19.6399 7.43604 19.625 7.3125C19.6015 7.12567 19.7694 6.97794 19.9062 6.9375C20.0431 6.89706 20.2646 6.98291 20.3438 7.0625C20.9606 7.6803 21.3512 8.52974 21.5625 9.4375C21.7738 10.3453 21.8125 11.3684 21.7188 12.3438C21.6251 13.3191 21.2902 14.3167 20.75 15.1562C20.2098 15.9958 19.3888 16.7301 18.4062 17.0938C17.6492 17.3752 16.84 17.5273 16.0312 17.5938C16.0147 17.5962 15.9891 17.5968 15.9688 17.6875C15.7324 19.0268 14.6152 20.0938 13.25 20.0938C11.8848 20.0938 10.7676 19.0268 10.5312 17.6875C10.5109 17.5968 10.4853 17.5962 10.4688 17.5938C9.65996 17.5273 8.85081 17.3752 8.09375 17.0938C6.75889 16.5872 5.73334 15.5386 5.15625 14.3125C5.00767 13.9994 4.85582 13.6328 4.84375 13.2812C4.83562 13.0464 4.89768 12.7778 5.09375 12.625C5.28982 12.4722 5.54028 12.4874 5.75 12.5938C6.13373 12.7916 6.47663 13.0769 6.6875 13.4688C6.85553 13.7645 6.97206 14.1152 7.15625 14.4375C7.26823 14.6434 7.4225 14.8437 7.625 15C7.8275 15.1563 8.11356 15.2858 8.34375 15.1562C8.48405 15.0771 8.51288 14.9062 8.5 14.75C8.47538 14.4765 8.2675 14.2595 8.09375 14.0625C7.93033 13.8781 7.79497 13.6751 7.6875 13.4688C7.52256 13.1594 7.40625 12.8201 7.40625 12.4688V9.53125M12.2188 7.65625C12.0881 7.65625 11.9675 7.69726 11.875 7.75C11.7825 7.80274 11.7188 7.87302 11.7188 8C11.7188 8.12698 11.7825 8.22851 11.875 8.28125C11.9675 8.33399 12.0881 8.375 12.2188 8.375C12.3494 8.375 12.4675 8.33399 12.5625 8.28125C12.6575 8.22851 12.7188 8.12698 12.7188 8C12.7188 7.87302 12.6575 7.80274 12.5625 7.75C12.4675 7.69726 12.3494 7.65625 12.2188 7.65625M6.625 9.5625C6.42404 9.5625 6.25 9.73654 6.25 9.9375C6.25 10.1385 6.42404 10.3125 6.625 10.3125C6.82596 10.3125 7 10.1385 7 9.9375C7 9.73654 6.82596 9.5625 6.625 9.5625Z"></path></svg>',
        description: 'Open-source AI models with a variety of stylistic options and free access.',
        supportedModels: [
            'stabilityai/stable-diffusion-xl-base-1.0',
            'prompthero/openjourney',
            'runwayml/stable-diffusion-v1-5'
        ],
        advantages: [
            'Free to use',
            'Wide range of model options',
            'Community-powered development',
            'Good for experimental styles',
            'No cost per generation'
        ],
        options: {
            model: {
                'stabilityai/stable-diffusion-xl-base-1.0': 'SDXL - Best quality but slower',
                'prompthero/openjourney': 'Midjourney style - Artistic results',
                'runwayml/stable-diffusion-v1-5': 'SD 1.5 - Faster generation'
            }
        }
    }
};

/* DOM refs */
const breedSel = document.getElementById('breed');
const priceEl = document.getElementById('price');
const mintBtn = document.getElementById('mintBtn');
const statusEl = document.getElementById('status');

/* Progress bar elements - create if they don't exist */
const progressBar = document.querySelector('.progress-bar') || document.createElement('div');
const progressContainer = document.querySelector('.progress-container') || document.createElement('div');

// Ensure progress bar exists - create if needed
if (!document.querySelector('.progress-container')) {
    progressContainer.className = 'progress-container';
    progressContainer.style.cssText = 'width: 100%; background-color: #f0f0f0; border-radius: 8px; margin: 10px 0; display: none;';

    progressBar.className = 'progress-bar';
    progressBar.style.cssText = 'height: 10px; background: linear-gradient(90deg, #8a65ff, #2775ca); border-radius: 8px; width: 0%; transition: width 0.3s ease-in-out;';

    progressContainer.appendChild(progressBar);
    statusEl.insertAdjacentElement('afterend', progressContainer);
}

/* read-only contract */
const nftRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, rpcProvider);

/* --- Initialize Preview System -------------------------------- */
function initializePreviewSystem() {
    const previewBtn = document.getElementById('generatePreviewBtn');
    const previewContainer = document.getElementById('previewContainer');

    if (previewBtn && previewContainer) {
        previewBtn.addEventListener('click', async () => {
            try {
                // Show loading state
                previewContainer.innerHTML = `
                    <div class="preview-loading">
                        <div class="preview-spinner"></div>
                        <p>Generating preview...</p>
                    </div>
                `;
                previewContainer.style.display = 'flex';

                // Get current selections
                const breed = document.getElementById('breed').value;
                const imageProvider = document.getElementById('imageProvider')?.value || 'dall-e';
                const promptExtras = document.getElementById('promptExtras')?.value || '';
                const negativePrompt = document.getElementById('negativePrompt')?.value || '';

                // Call the preview generation API
                const response = await fetch('/api/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        breed,
                        imageProvider,
                        promptExtras,
                        negativePrompt
                    })
                });

                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }

                const data = await response.json();

                // Display the preview image with animation
                previewContainer.innerHTML = `
                    <div class="preview-result">
                        <img src="${data.previewUrl}" alt="Preview of your Ninja Cat" class="preview-image">
                        <div class="preview-details">
                            <h4>Preview of your Ninja Cat</h4>
                            <p>This is a low-resolution preview. The final minted NFT will have higher quality and unique traits.</p>
                            <div class="preview-traits">
                                <div class="preview-trait"><span>Breed:</span> ${breed}</div>
                                ${data.sampleTraits.map(trait =>
                    `<div class="preview-trait"><span>${trait.type}:</span> ${trait.value}</div>`
                ).join('')}
                            </div>
                            <p class="preview-disclaimer">Note: Actual NFT will have different random traits.</p>
                        </div>
                    </div>
                `;

                // Animate the preview appearance
                const previewImage = previewContainer.querySelector('.preview-image');
                if (previewImage && window.gsap) {
                    gsap.from(previewImage, {
                        opacity: 0,
                        scale: 0.8,
                        duration: 0.8,
                        ease: 'elastic.out(1, 0.5)'
                    });
                }

            } catch (error) {
                console.error('Preview generation failed:', error);
                previewContainer.innerHTML = `
                    <div class="preview-error">
                        <svg viewBox="0 0 24 24" width="36" height="36">
                            <path fill="#ef4444" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
                        </svg>
                        <p>Preview generation failed: ${error.message}</p>
                    </div>
                `;
            }
        });
    }
}

/* --- show current price -------------------------------- */
async function initializePricing() {
    try {
        // Get USDC price
        const rawPrice = await nftRead.price();
        const formattedPrice = ethers.formatUnits(rawPrice, 6);

        // Update price display
        priceEl.textContent = `Price: ${formattedPrice} USDC`;

        // Trigger VTRU conversion if that function exists
        if (window.updateVtruConversion) {
            const exchangeRate = await window.getExchangeRate();
            window.updateVtruConversion(formattedPrice, exchangeRate);
        }

        mintBtn.disabled = false;

        // Initialize the preview system
        initializePreviewSystem();

        // Initialize advanced visuals
        initializeAdvancedVisuals();

    } catch (err) {
        console.error('Failed to get price:', err);
        priceEl.textContent = `Error loading price: ${err.message}`;
    }
}

/* --- Enhanced visual feedback -------------------------------- */
function initializeAdvancedVisuals() {
    // Set up floating particles behind mint button
    setupParticleEffect();

    // Add hover effects to provider selection
    enhanceProviderSelection();

    // Initialize tooltips
    initializeTooltips();

    // Add breed preview animations
    animateBreedSelection();
}

// Create floating particle effect behind mint button
function setupParticleEffect() {
    if (!mintBtn) return;

    const particleContainer = document.createElement('div');
    particleContainer.className = 'particle-container';

    // Insert before mint button
    mintBtn.parentNode.insertBefore(particleContainer, mintBtn);

    // Create particles
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'mint-particle';

        // Random properties
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDuration = `${3 + Math.random() * 7}s`;
        particle.style.animationDelay = `${Math.random() * 5}s`;
        particle.style.opacity = `${0.1 + Math.random() * 0.4}`;

        particleContainer.appendChild(particle);
    }
}

// Enhance provider selection with visual feedback
function enhanceProviderSelection() {
    const providerSelector = document.getElementById('imageProvider');
    if (!providerSelector) return;

    // Add icon display next to provider selection
    const providerIcons = document.createElement('div');
    providerIcons.className = 'provider-icons';

    // Add icon for each provider
    Object.entries(providers).forEach(([key, provider]) => {
        const icon = document.createElement('div');
        icon.className = `provider-icon ${key === providerSelector.value ? 'active' : ''}`;
        icon.dataset.provider = key;
        icon.innerHTML = provider.icon;
        icon.title = provider.name;

        // Add click event to select provider
        icon.addEventListener('click', () => {
            providerSelector.value = key;
            providerSelector.dispatchEvent(new Event('change'));

            // Update active state
            document.querySelectorAll('.provider-icon').forEach(el =>
                el.classList.toggle('active', el.dataset.provider === key)
            );
        });

        providerIcons.appendChild(icon);
    });

    // Add icons after provider selector
    providerSelector.parentNode.insertBefore(providerIcons, providerSelector.nextSibling);

    // Update icons when provider changes
    providerSelector.addEventListener('change', () => {
        const selected = providerSelector.value;
        document.querySelectorAll('.provider-icon').forEach(icon =>
            icon.classList.toggle('active', icon.dataset.provider === selected)
        );
    });
}

// Initialize tooltips for better UX
function initializeTooltips() {
    // Add tooltip to each element with data-tooltip attribute
    document.querySelectorAll('[data-tooltip]').forEach(element => {
        const tooltipText = element.dataset.tooltip;

        element.addEventListener('mouseenter', () => {
            // Create tooltip element
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = tooltipText;

            // Position tooltip
            const rect = element.getBoundingClientRect();
            tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
            tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2)}px`;
            tooltip.style.transform = 'translateX(-50%)';

            // Add to document
            document.body.appendChild(tooltip);

            // Animate in
            setTimeout(() => tooltip.classList.add('visible'), 10);

            // Store reference for removal
            element._tooltip = tooltip;
        });

        element.addEventListener('mouseleave', () => {
            if (element._tooltip) {
                // Animate out
                element._tooltip.classList.remove('visible');

                // Remove after animation
                setTimeout(() => {
                    if (element._tooltip.parentNode) {
                        element._tooltip.parentNode.removeChild(element._tooltip);
                    }
                    element._tooltip = null;
                }, 300);
            }
        });
    });
}

// Add animations to breed selection
function animateBreedSelection() {
    const breedSelector = document.getElementById('breed');
    if (!breedSelector) return;

    // Track the currently showing breed info
    let currentBreedInfo = document.querySelector('.breed-info.active');

    breedSelector.addEventListener('change', () => {
        const selectedBreed = breedSelector.value.toLowerCase().replace(' ', '');
        const targetInfo = document.getElementById(`${selectedBreed}-info`);

        if (targetInfo && currentBreedInfo !== targetInfo) {
            // Animate out current info
            if (currentBreedInfo && window.gsap) {
                gsap.to(currentBreedInfo, {
                    opacity: 0,
                    y: -20,
                    duration: 0.3,
                    onComplete: () => {
                        currentBreedInfo.classList.remove('active');

                        // Animate in new info
                        targetInfo.classList.add('active');
                        gsap.fromTo(targetInfo,
                            { opacity: 0, y: 20 },
                            { opacity: 1, y: 0, duration: 0.5 }
                        );

                        currentBreedInfo = targetInfo;
                    }
                });
            } else {
                // Fallback without animations
                if (currentBreedInfo) currentBreedInfo.classList.remove('active');
                targetInfo.classList.add('active');
                currentBreedInfo = targetInfo;
            }
        }
    });
}

/* --- Progress Tracking ---------------------------------- */
function updateProgress(percent, detail = {}) {
    // Show progress container
    progressContainer.style.display = 'block';

    // Update progress bar with animation
    if (window.gsap) {
        gsap.to(progressBar, {
            width: `${percent}%`,
            duration: 0.5,
            ease: 'power2.inOut'
        });
    } else {
        // Fallback without animation
        progressBar.style.width = `${percent}%`;
    }

    // Update status message if provided
    if (detail.message) {
        showStatus(detail.message, detail.showSpinner !== false);
    }
}

function showStatus(msg, showSpinner = true) {
    statusEl.style.display = 'block';

    // Prepare the status message
    let statusHTML = '';
    if (showSpinner) {
        statusHTML = '<div class="spinner"></div> ';
    }
    statusHTML += msg;

    // Update status with animation
    if (window.gsap) {
        // Fade out current status
        gsap.to(statusEl, {
            opacity: 0,
            y: -10,
            duration: 0.2,
            onComplete: () => {
                // Update content
                statusEl.innerHTML = statusHTML;

                // Fade in new status
                gsap.to(statusEl, {
                    opacity: 1,
                    y: 0,
                    duration: 0.3
                });
            }
        });
    } else {
        // Fallback without animation
        statusEl.innerHTML = statusHTML;
    }
}

mintBtn.onclick = async () => {
    try {
        mintBtn.disabled = true;
        showStatus('Connecting wallet…', true);
        updateProgress(5);

        const result = await connectWallet(document.getElementById('connectBtn'));
        const signer = result.signer;
        const addr = result.address;  // Fixed - function returns 'address', not 'addr'

        console.log('Wallet connected:', {
            address: addr,
            signer: !!signer,
            validAddress: ethers.isAddress(addr || '')
        });

        // CRITICAL FIX: Always query the DOM directly to get the current values
        const imageProvider = document.getElementById('imageProvider')?.value || 'dall-e';
        const breed = breedSel.value;

        // Get any additional prompt details
        const promptExtrasValue = document.getElementById('promptExtras')?.value || '';
        const negativePromptValue = document.getElementById('negativePrompt')?.value ||
            'text, watermark, signature, borders, low quality, blurry, distorted';

        console.log(`Selected image provider: ${imageProvider}`);
        console.log(`Custom prompt additions: ${promptExtrasValue}`);
        console.log(`Negative prompt: ${negativePromptValue}`);

        // Collect provider-specific options
        const providerOptions = {};
        if (imageProvider === 'dall-e') {
            const dalleModel = document.getElementById('dalle-model')?.value;
            if (dalleModel) providerOptions.model = dalleModel;

            const dalleQuality = document.getElementById('dalle-quality')?.value;
            if (dalleQuality) providerOptions.quality = dalleQuality;

            const dalleStyle = document.getElementById('dalle-style')?.value;
            if (dalleStyle) providerOptions.style = dalleStyle;

            console.log('DALL-E options:', providerOptions);
        }
        else if (imageProvider === 'stability') {
            const stylePreset = document.getElementById('stability-preset')?.value;
            if (stylePreset) providerOptions.stylePreset = stylePreset;
            console.log('Stability options:', providerOptions);
        }
        else if (imageProvider === 'huggingface') {
            const hfModel = document.getElementById('hf-model')?.value;
            if (hfModel) providerOptions.model = hfModel;
            console.log('HuggingFace options:', providerOptions);
        }

        /* get live contracts w/ signer */
        const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);
        const usdcAddr = await nft.usdc().catch(() => USDC_ADDRESS);
        const usdc = new ethers.Contract(usdcAddr, USDC_ABI, signer);
        updateProgress(15);

        // Get current price
        const currentPrice = await nft.price();

        /* approve if needed */
        if ((await usdc.allowance(addr, CONTRACT_ADDRESS)) < currentPrice) {
            showStatus('Approving USDC…', true);
            updateProgress(20);

            // Display approval confirmation UI
            const approvalUI = document.createElement('div');
            approvalUI.className = 'approval-ui';
            approvalUI.innerHTML = `
                <div class="approval-animation">
                    <svg class="approval-svg" viewBox="0 0 24 24" width="48" height="48">
                        <path class="approval-path" fill="none" stroke="#8a65ff" stroke-width="2" 
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path>
                        <path class="checkmark-path" fill="none" stroke="#8a65ff" stroke-width="2"
                            d="M7 13l3 3 7-7" stroke-dasharray="15" stroke-dashoffset="15"></path>
                    </svg>
                </div>
                <div class="approval-text">
                    <h4>Approving USDC</h4>
                    <p>Please confirm the approval transaction in your wallet...</p>
                </div>
            `;

            // Add to status
            statusEl.innerHTML = '';
            statusEl.appendChild(approvalUI);

            // Animate approval SVG if GSAP is available
            if (window.gsap) {
                gsap.to('.approval-path', {
                    strokeDasharray: '75',
                    strokeDashoffset: '0',
                    duration: 1.5,
                    ease: 'power2.inOut'
                });
            }

            const approveTx = await usdc.approve(CONTRACT_ADDRESS, ethers.MaxUint256);

            // Update approval animation
            if (window.gsap) {
                gsap.to('.checkmark-path', {
                    strokeDashoffset: '0',
                    duration: 0.5,
                    delay: 0.2
                });
            }

            showStatus('Waiting for approval confirmation...', true);
            updateProgress(25);
            await approveTx.wait();
            updateProgress(30);
        } else {
            updateProgress(30);
        }

        /* mint with selected breed and options */
        console.log('DEBUG - Provider selection:', {
            selected: imageProvider,
            providerObj: providers[imageProvider],
            options: providerOptions
        });

        // Get provider name for display
        const providerName = providers[imageProvider]?.name || imageProvider;
        showStatus(`Creating your ninja cat with ${providerName}...`, true);
        updateProgress(35);

        // Debug parameters before sending
        console.log('Contract address:', CONTRACT_ADDRESS);
        console.log('Breed parameter:', breed);
        console.log('Connected address:', addr);

        // Add the mint options to the transaction
        let tx;

        try {
            // CRITICAL FIX: Include providerOptions in the transaction metadata
            // Create a complete transaction metadata object with all parameters
            const txMetadata = {
                imageProvider,
                promptExtras: promptExtrasValue || '',
                negativePrompt: negativePromptValue || '',
                providerOptions: providerOptions
            };

            // Log what we're sending to ensure it contains the correct data
            console.log('Sending transaction with complete metadata:', txMetadata);

            // Convert the metadata to bytes format
            const metadata = ethers.toUtf8Bytes(JSON.stringify(txMetadata));

            // Make sure breed is a proper string value
            const breedString = String(breed || '').trim();
            console.log(`Attempting mint with breed: "${breedString}" and full metadata`);

            // Send the transaction with the breed and metadata
            tx = await nft.buy(breedString, ethers.hexlify(metadata));

        } catch (err) {
            console.warn('First mint attempt with metadata failed:', err);

            try {
                // Try again with explicit transaction options
                const overrides = {
                    gasLimit: 600000,  // Explicit gas limit
                    value: 0           // Explicit zero value (no ETH)
                };

                console.log('Retrying with overrides:', overrides);
                tx = await nft.buy(breed, overrides);
            } catch (err2) {
                // Last resort - try with just the breed
                console.warn('Second mint attempt failed:', err2);
                console.log('Attempting final mint with just breed parameter');

                tx = await nft.buy(breed);
            }
        }

        // Create transaction confirmation UI
        const txConfirmationUI = document.createElement('div');
        txConfirmationUI.className = 'tx-confirmation';
        txConfirmationUI.innerHTML = `
            <div class="tx-animation">
                <div class="tx-circle"></div>
                <div class="tx-pulse"></div>
            </div>
            <div class="tx-details">
                <h4>Transaction sent!</h4>
                <p>Waiting for blockchain confirmation...</p>
                <div class="tx-hash">
                    <span>Tx: ${short(tx.hash)}</span>
                    <a href="https://explorer-new.vitruveo.xyz/tx/${tx.hash}" target="_blank">
                        <svg viewBox="0 0 24 24" width="12" height="12">
                            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </a>
                </div>
            </div>
        `;

        // Add to status with animation
        statusEl.innerHTML = '';
        statusEl.appendChild(txConfirmationUI);

        // Animate transaction circle if GSAP is available
        if (window.gsap) {
            gsap.to('.tx-circle', {
                rotation: 360,
                duration: 2,
                repeat: -1,
                ease: 'linear'
            });

            gsap.to('.tx-pulse', {
                scale: 1.5,
                opacity: 0,
                duration: 1.5,
                repeat: -1,
                ease: 'power2.out'
            });
        }

        updateProgress(50);
        const receipt = await tx.wait();
        updateProgress(70);

        // Determine if a token ID was emitted in the event
        let tokenId = null;
        try {
            // Look for Transfer event from the contract
            for (const log of receipt.logs) {
                try {
                    const parsedLog = nft.interface.parseLog(log);
                    if (parsedLog && parsedLog.name === 'Transfer') {
                        tokenId = parsedLog.args.tokenId?.toString() || parsedLog.args[2]?.toString();
                        break;
                    }
                } catch (e) {
                    // Skip logs that can't be parsed
                }
            }

            // If we found a token ID, notify the server about the provider choice
            if (tokenId) {
                updateProgress(75);

                // Create NFT generation animation
                const generationUI = document.createElement('div');
                generationUI.className = 'nft-generation';
                generationUI.innerHTML = `
                    <div class="generation-container">
                        <div class="generation-animation">
                            <svg class="generation-svg" viewBox="0 0 100 100" width="80" height="80">
                                <circle class="generation-circle" cx="50" cy="50" r="40" fill="none" stroke="#8a65ff" stroke-width="4"></circle>
                                <path class="generation-path" d="M50,10 A40,40 0 0,1 90,50" fill="none" stroke="#ff9800" stroke-width="4" stroke-linecap="round"></path>
                            </svg>
                        </div>
                        <div class="generation-text">
                            <h4>Creating Your Ninja Cat</h4>
                            <p>Generating AI image with ${providerName}...</p>
                            <div class="generation-stages">
                                <div class="generation-stage active" data-stage="mint">✓ NFT Minted</div>
                                <div class="generation-stage" data-stage="traits">Generating Traits</div>
                                <div class="generation-stage" data-stage="image">Creating Image</div>
                                <div class="generation-stage" data-stage="metadata">Finalizing Metadata</div>
                            </div>
                        </div>
                    </div>
                `;

                // Add to status with animation
                statusEl.innerHTML = '';
                statusEl.appendChild(generationUI);

                // Animate generation SVG if GSAP is available
                if (window.gsap) {
                    gsap.to('.generation-circle', {
                        strokeDasharray: '251.2',
                        strokeDashoffset: '0',
                        duration: 2,
                        ease: 'power2.inOut'
                    });

                    gsap.to('.generation-path', {
                        rotation: 360,
                        transformOrigin: '50% 50%',
                        duration: 3,
                        repeat: -1,
                        ease: 'linear'
                    });
                }

                // Build the API request URL with all options
                const apiUrl = new URL(`/api/process/${tokenId}`, window.location.origin);
                apiUrl.searchParams.append('breed', breed);
                apiUrl.searchParams.append('imageProvider', imageProvider);

                // Add provider-specific options if available - CRITICAL FOR ADVANCED OPTIONS
                if (Object.keys(providerOptions).length > 0) {
                    const optionsJson = JSON.stringify(providerOptions);
                    apiUrl.searchParams.append('providerOptions', optionsJson);
                    console.log(`Sending provider options to API: ${optionsJson}`);
                }

                // Add prompt extras if specified
                if (promptExtrasValue) {
                    apiUrl.searchParams.append('promptExtras', promptExtrasValue);
                }

                // Add negative prompt if specified
                if (negativePromptValue) {
                    apiUrl.searchParams.append('negativePrompt', negativePromptValue);
                }

                try {
                    // Send request to the server with all options
                    fetch(apiUrl)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Server responded with status: ${response.status}`);
                            }
                            return response.json();
                        })
                        .then(data => {
                            console.log('Server processing image:', data);
                            updateProgress(85);

                            // Update generation stage
                            updateGenerationStage('traits');

                            // Start polling for image status if server supports it
                            if (data.taskId) {
                                pollImageStatus(data.taskId, tokenId);
                            } else {
                                // No task ID, just show completion after a delay
                                setTimeout(() => {
                                    updateProgress(100);
                                    showMintSuccess(tokenId, tx.hash, imageProvider);
                                }, 3000);
                            }
                        })
                        .catch(error => {
                            console.warn('Server notification issue:', error);
                            // Still show success even if server notification fails
                            updateProgress(100);
                            showMintSuccess(tokenId, tx.hash, imageProvider);
                        });
                } catch (apiError) {
                    console.warn('Could not notify server about provider choice:', apiError);
                    // Still show success
                    updateProgress(100);
                    showMintSuccess(tokenId, tx.hash, imageProvider);
                }
            } else {
                // No token ID found, but transaction succeeded
                updateProgress(100);
                showMintSuccess(null, tx.hash, imageProvider);
            }
        } catch (eventErr) {
            console.warn('Could not determine token ID:', eventErr);
            // Still show success
            updateProgress(100);
            showMintSuccess(null, tx.hash, imageProvider);
        }
    } catch (err) {
        console.error(err);
        let errorMessage = err.message;

        // Try to extract a more user-friendly message
        if (err.info?.error?.message) {
            errorMessage = err.info.error.message;
        } else if (err.data?.message) {
            errorMessage = err.data.message;
        }

        // Handle common errors more gracefully
        if (errorMessage.includes('insufficient funds')) {
            errorMessage = 'Insufficient funds to complete the transaction.';
        } else if (errorMessage.includes('user rejected')) {
            errorMessage = 'Transaction was rejected in your wallet.';
        }

        // Create an animated error display
        const errorUI = document.createElement('div');
        errorUI.className = 'error-ui';
        errorUI.innerHTML = `
            <div class="error-icon">
                <svg viewBox="0 0 24 24" width="48" height="48">
                    <path fill="#ef4444" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
                </svg>
            </div>
            <div class="error-content">
                <h4>Minting Failed</h4>
                <p>${errorMessage}</p>
                <button class="retry-btn">Try Again</button>
            </div>
        `;

        // Add retry button functionality
        const retryBtn = errorUI.querySelector('.retry-btn');
        retryBtn.addEventListener('click', () => {
            // Clear error and retry
            statusEl.innerHTML = '';
            statusEl.style.display = 'none';
            progressContainer.style.display = 'none';
            mintBtn.disabled = false;
        });

        // Add to status with animation
        statusEl.innerHTML = '';
        statusEl.appendChild(errorUI);

        // Animate error appearance if GSAP is available
        if (window.gsap) {
            gsap.from('.error-icon', {
                scale: 0.5,
                opacity: 0,
                duration: 0.5,
                ease: 'back.out(1.7)'
            });

            gsap.from('.error-content', {
                y: 20,
                opacity: 0,
                duration: 0.5,
                delay: 0.2
            });
        }

        // Hide progress bar on error
        progressContainer.style.display = 'none';
    } finally {
        mintBtn.disabled = false;
    }
};

// Function to update generation stage
function updateGenerationStage(stage) {
    const stages = document.querySelectorAll('.generation-stage');
    if (!stages.length) return;

    // Find current active stage
    const currentActive = document.querySelector('.generation-stage.active');
    const currentIndex = Array.from(stages).indexOf(currentActive);

    // Find target stage
    const targetStage = document.querySelector(`.generation-stage[data-stage="${stage}"]`);
    if (!targetStage) return;

    const targetIndex = Array.from(stages).indexOf(targetStage);

    // Mark all previous stages as completed
    for (let i = 0; i <= targetIndex; i++) {
        if (i <= currentIndex) continue; // Skip already active stages

        const stageEl = stages[i];

        // Animate stage activation if GSAP is available
        if (window.gsap) {
            gsap.to(stageEl, {
                backgroundColor: 'rgba(138, 101, 255, 0.1)',
                color: '#8a65ff',
                duration: 0.3,
                onComplete: () => {
                    stageEl.classList.add('active');
                    // Add checkmark to completed stages
                    if (i < targetIndex) {
                        stageEl.innerHTML = `✓ ${stageEl.textContent}`;
                    }
                }
            });
        } else {
            stageEl.classList.add('active');
        }
    }
}

// Function to fetch NFT details for download
async function fetchNFTDetails(tokenId) {
    try {
        // Get provider from config
        const provider = rpcProvider;
        const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);

        // Get token URI
        const tokenURI = await nft.tokenURI(tokenId);
        console.log(`Token URI for #${tokenId}:`, tokenURI);

        // Fetch metadata
        let metadataUrl = tokenURI;

        if (tokenURI.startsWith('ipfs://')) {
            metadataUrl = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
        }

        const response = await fetch(metadataUrl);
        const metadata = await response.json();

        // Get the image URL
        const imageUrl = metadata.image;

        return {
            tokenId: tokenId,
            metadata: metadata,
            image: imageUrl
        };
    } catch (error) {
        console.error('Error fetching NFT details:', error);
        return null;
    }
}

// Function to show success message
function showMintSuccess(tokenId, txHash, provider) {
    // Format provider name nicely - using the providers object
    const providerName = providers[provider]?.name || provider.charAt(0).toUpperCase() + provider.slice(1);

    // Show explorer link
    const explorerUrl = `https://explorer-new.vitruveo.xyz/tx/${txHash}`;

    // Create success animation
    const successUI = document.createElement('div');
    successUI.className = 'success-ui';

    // Build HTML with more complex animation
    successUI.innerHTML = `
        <div class="success-animation">
            <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
        </div>
        <div class="success-content">
            <h4>Successfully Minted!</h4>
            <p>Your ninja cat is being generated with ${providerName}.</p>
                        <a href="${explorerUrl}" target="_blank" class="explorer-link">View on Explorer</a>
        </div>
    `;

    // Add to status with animation
    statusEl.innerHTML = '';
    statusEl.appendChild(successUI);

    // Animate checkmark if GSAP is available
    if (window.gsap) {
        gsap.set('.checkmark-circle', {
            strokeDasharray: '157',
            strokeDashoffset: '157'
        });

        gsap.set('.checkmark-check', {
            strokeDasharray: '32',
            strokeDashoffset: '32'
        });

        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

        tl.to('.checkmark-circle', {
            strokeDashoffset: 0,
            duration: 0.6
        })
            .to('.checkmark-check', {
                strokeDashoffset: 0,
                duration: 0.4
            }, '-=0.2')
            .to('.success-content', {
                opacity: 1,
                y: 0,
                duration: 0.5
            }, '-=0.2');
    }

    // If we have a token ID, add a view button
    if (tokenId) {
        const viewBtn = document.createElement('a');
        viewBtn.href = `kitty.html?id=${tokenId}`;
        viewBtn.className = 'view-nft-btn';
        viewBtn.textContent = `View Your New NFT #${tokenId}`;

        // Add hover effects with GSAP if available
        if (window.gsap) {
            viewBtn.addEventListener('mouseenter', () => {
                gsap.to(viewBtn, {
                    scale: 1.05,
                    boxShadow: '0 8px 20px rgba(138,101,255,0.4)',
                    duration: 0.3
                });
            });

            viewBtn.addEventListener('mouseleave', () => {
                gsap.to(viewBtn, {
                    scale: 1,
                    boxShadow: '0 4px 10px rgba(138,101,255,0.2)',
                    duration: 0.3
                });
            });
        }

        successUI.querySelector('.success-content').appendChild(viewBtn);

        // Enable download functionality
        fetchNFTDetails(tokenId).then(nftData => {
            if (nftData) {
                // Create download section
                const downloadSection = document.createElement('div');
                downloadSection.className = 'download-section';
                downloadSection.innerHTML = `
                    <h5>Download Your NFT</h5>
                    <div class="download-buttons">
                        <button class="download-image-btn">
                            <svg viewBox="0 0 24 24" width="16" height="16">
                                <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                            </svg>
                            Image
                        </button>
                        <button class="download-json-btn">
                            <svg viewBox="0 0 24 24" width="16" height="16">
                                <path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-2 16c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-2-4h4v3h-4v-3zm0-5h4v3h-4v-3zm-2-2V4h1v3H8zm0 4h1v3H8zm0 4h1v3H8z"/>
                            </svg>
                            Metadata
                        </button>
                    </div>
                `;

                successUI.querySelector('.success-content').appendChild(downloadSection);

                // Setup image download
                downloadSection.querySelector('.download-image-btn').addEventListener('click', async () => {
                    try {
                        let imageUrl = nftData.image;

                        // Convert IPFS URL to HTTP if needed
                        if (imageUrl.startsWith('ipfs://')) {
                            imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
                        }

                        // Create a loader element
                        const loader = document.createElement('div');
                        loader.className = 'download-loader';
                        loader.innerHTML = '<div class="spinner"></div> Downloading...';
                        downloadSection.appendChild(loader);

                        // Fetch the image
                        const response = await fetch(imageUrl);
                        const blob = await response.blob();

                        // Create a temporary link and trigger download
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = `ninja-cat-${tokenId}.png`;
                        document.body.appendChild(a);
                        a.click();

                        // Clean up
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        downloadSection.removeChild(loader);

                        // Show success message
                        showToast('Image downloaded successfully!', 'success');
                    } catch (error) {
                        console.error('Error downloading image:', error);
                        showToast('Failed to download image. Please try again.', 'error');
                    }
                });

                // Setup metadata download
                downloadSection.querySelector('.download-json-btn').addEventListener('click', () => {
                    try {
                        // Format metadata as pretty JSON
                        const metadataStr = JSON.stringify(nftData.metadata, null, 2);
                        const blob = new Blob([metadataStr], { type: 'application/json' });

                        // Create a temporary link and trigger download
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = `ninja-cat-${tokenId}-metadata.json`;
                        document.body.appendChild(a);
                        a.click();

                        // Clean up
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);

                        // Show success message
                        showToast('Metadata downloaded successfully!', 'success');
                    } catch (error) {
                        console.error('Error downloading metadata:', error);
                        showToast('Failed to download metadata. Please try again.', 'error');
                    }
                });
            }
        }).catch(error => {
            console.warn('Could not fetch NFT details for download:', error);
        });
    }
}

// Helper function to show toast notifications
function showToast(message, type = 'info', duration = 3000) {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);

        // Add toast styles if not already in CSS
        if (!document.querySelector('#toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                .toast-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .toast {
                    min-width: 250px;
                    padding: 12px 16px;
                    border-radius: 8px;
                    background: #333;
                    color: white;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    display: flex;
                    align-items: center;
                    overflow: hidden;
                    transform: translateX(100%);
                    opacity: 0;
                }
                .toast.show {
                    animation: toast-in 0.3s forwards, toast-out 0.3s forwards;
                    animation-delay: 0s, ${(duration / 1000) - 0.3}s;
                }
                .toast.info { background: #3498db; }
                .toast.success { background: linear-gradient(135deg, #8a65ff, #2775ca); }
                .toast.warning { background: #f39c12; }
                .toast.error { background: #e74c3c; }
                .toast-icon {
                    margin-right: 12px;
                    display: flex;
                }
                .toast-content {
                    flex: 1;
                }
                @keyframes toast-in {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes toast-out {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Create toast with appropriate icon
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Different icons for different message types
    let iconSvg = '';
    switch (type) {
        case 'success':
            iconSvg = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg>';
            break;
        case 'error':
            iconSvg = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>';
            break;
        case 'warning':
            iconSvg = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-2h-2v2zm0-10v6h2V7h-2z"></path></svg>';
            break;
        default:
            iconSvg = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>';
    }

    toast.innerHTML = `
        <div class="toast-icon">${iconSvg}</div>
        <div class="toast-content">${message}</div>
    `;

    // Add to container
    toastContainer.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after duration
    setTimeout(() => {
        // Remove from DOM after animation completes
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// Poll for image generation status
function pollImageStatus(taskId, tokenId) {
    let pollAttempts = 0;
    const maxPolls = 30; // Maximum number of polling attempts
    const pollInterval = 2000; // Poll every 2 seconds

    const checkStatus = async () => {
        if (pollAttempts >= maxPolls) {
            // Stop polling after max attempts
            updateProgress(100);
            showMintSuccess(tokenId, null, 'AI service');
            return;
        }

        pollAttempts++;

        try {
            const response = await fetch(`/api/status/${taskId}`);
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Image generation status:', data);

            // Update progress based on status
            if (data.status === 'completed') {
                // Final stage - all complete
                updateGenerationStage('metadata');

                // Show completion animation
                if (window.gsap) {
                    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
                    tl.to('.generation-circle', {
                        stroke: '#4ade80',
                        duration: 0.5
                    })
                        .to('.generation-path', {
                            stroke: '#4ade80',
                            opacity: 0,
                            duration: 0.3
                        });
                }

                updateProgress(100);
                setTimeout(() => {
                    showMintSuccess(tokenId, null, data.provider || 'AI service');
                }, 1000);
                return;
            } else if (data.status === 'failed') {
                // Image failed but NFT is still minted
                updateProgress(100);
                showToast('Your NFT was minted, but the image generation encountered an issue. A default image will be used.', 'warning', 5000);
                showMintSuccess(tokenId, null, data.provider || 'AI service');
                return;
            } else if (data.status === 'processing') {
                // Still processing - update the stage based on progress
                const progressPercent = data.progress || Math.min(80 + (pollAttempts * 1), 95);
                updateProgress(progressPercent);

                // Update generation stage based on message
                if (data.stage) {
                    updateGenerationStage(data.stage);
                } else if (data.message) {
                    if (data.message.includes('trait')) {
                        updateGenerationStage('traits');
                    } else if (data.message.includes('image') || data.message.includes('generating')) {
                        updateGenerationStage('image');
                    } else if (data.message.includes('metadata') || data.message.includes('finalizing')) {
                        updateGenerationStage('metadata');
                    }
                }

                // Continue polling
                setTimeout(checkStatus, pollInterval);
            } else {
                // Unknown status - just continue polling
                updateProgress(Math.min(80 + (pollAttempts * 1), 95));
                setTimeout(checkStatus, pollInterval);
            }
        } catch (error) {
            console.warn('Error polling for image status:', error);
            // Continue polling despite error
            updateProgress(Math.min(80 + (pollAttempts * 1), 95));
            setTimeout(checkStatus, pollInterval * 1.5);  // Slightly longer wait on error
        }
    };

    // Start polling
    checkStatus();
}

// Initialize the page
initializePricing();

// Add event listener for provider change
const imageProviderSelect = document.getElementById('imageProvider');
if (imageProviderSelect) {
    imageProviderSelect.addEventListener('change', function () {
        const selectedProvider = this.value;

        // Update provider info sections
        document.querySelectorAll('.provider-info').forEach(info => {
            info.classList.remove('active');
        });

        const selectedInfo = document.getElementById(`${selectedProvider}-info`);
        if (selectedInfo) {
            selectedInfo.classList.add('active');
        }

        // Update provider-specific options
        document.querySelectorAll('.provider-option-panel').forEach(panel => {
            panel.style.display = 'none';
        });

        const optionsPanel = document.getElementById(`${selectedProvider}-options`);
        if (optionsPanel) {
            optionsPanel.style.display = 'block';
        }

        // Store the selected provider in localStorage
        localStorage.setItem('ninjacat_provider', selectedProvider);
        console.log(`Selected image provider: ${selectedProvider}`);
    });

    // Set initial provider from localStorage if available
    const savedProvider = localStorage.getItem('ninjacat_provider');
    if (savedProvider && Array.from(imageProviderSelect.options).some(opt => opt.value === savedProvider)) {
        imageProviderSelect.value = savedProvider;
        // Trigger change event to update UI
        imageProviderSelect.dispatchEvent(new Event('change'));
    }
}

// Add keyboard shortcuts for power users
document.addEventListener('keydown', (e) => {
    // Alt+M to mint (if button is enabled)
    if (e.altKey && e.key === 'm' && !mintBtn.disabled) {
        e.preventDefault();
        mintBtn.click();
    }

    // Alt+P to open preview (if button exists)
    if (e.altKey && e.key === 'p') {
        e.preventDefault();
        const previewBtn = document.getElementById('generatePreviewBtn');
        if (previewBtn) previewBtn.click();
    }
});

// Export functions that may be needed by other scripts
export {
    providers,
    showToast,
    updateProgress,
    showStatus
};