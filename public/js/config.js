/*  centralised constants  */
export const RPC_URL = 'https://rpc.vitruveo.xyz';

export const CONTRACT_ADDRESS = '0xC4C8770f40e8eF17b27ddD987eCb8669b0924Fd6'; // NFT
export const USDC_ADDRESS = '0xbCfB3FCa16b12C7756CD6C24f1cC0AC0E38569CF'; // Vitruveo USDC

/* minimal ABIs (read + mint only) */
export const NFT_ABI = [
    'function price() view returns (uint256)',
    'function usdc() view returns (address)',
    'function buy(string) returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)',
    'function tokenURI(uint256) view returns (string)'
];
export const USDC_ABI = [
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)'
];
