```java
import cn.hutool.core.codec.Base64;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SmUtil;
import cn.hutool.crypto.symmetric.SM4;
import lombok.extern.slf4j.Slf4j;

/**
 * SM4加密解密工具类
 * 用于处理报文内容的加密和解密操作
 * @date 2026-03-19
 */
@Slf4j
public class SM4EncryptionUtils {

    /**
     * 使用字节数组密钥对明文进行SM4加密
     * Hutool 为第三方jar 包，可通过 maven 引入
     *
     * @param plainText 待加密的明文
     * @param keyBytes  密钥
     * @return Base64编码的加密结果
     */
    public static String encrypt(String plainText, byte[] keyBytes) {
        if (StrUtil.isBlank(plainText)) {
            log.warn("encrypt: 明文为空");
            return null;
        }

        if (!isValidKey(keyBytes)) {
            return null;
        }

        try {
            // Hutool 的 SM4 默认支持传入 byte[]
            SM4 sm4 = SmUtil.sm4(keyBytes);

            // 直接返回 Base64 编码后的字符串
            String encrypted = sm4.encryptBase64(plainText);

            log.debug("encrypt: 加密成功，原文长度={}, 密文长度={}", plainText.length(), encrypted.length());
            return encrypted;

        } catch (Exception e) {
            log.error("encrypt: 加密失败", e);
            return null;
        }
    }

    /**
     * 使用字节数组密钥对密文进行SM4解密
     *
     * @param encryptedText Base64编码的密文
     * @param keyBytes     密钥
     * @return 解密后的明文
     */
    public static String decrypt(String encryptedText, byte[] keyBytes) {
        if (StrUtil.isBlank(encryptedText)) {
            log.warn("decrypt: 密文为空");
            return null;
        }

        if (!isValidKey(keyBytes)) {
            return null;
        }

        try {
            SM4 sm4 = SmUtil.sm4(keyBytes);

            // 执行解密，sm4.decryptStr 内部会自动处理 Base64 解码
            String decrypted = sm4.decryptStr(encryptedText);

            log.debug("decrypt: 解密成功，密文长度={}, 原文长度={}", encryptedText.length(), decrypted.length());
            return decrypted;

        } catch (Exception e) {
            log.error("decrypt: 解密失败", e);
            return null;
        }
    }

    /**
     * 生成新的SM4密钥并返回Base64编码格式
     *
     * @return Base64编码的SM4密钥
     */
    public static String generateKey() {
        try {
            // 生成 128 位 (16字节) 的 SM4 密钥
            byte[] keyBytes = SmUtil.sm4().getSecretKey().getEncoded();

            // 使用 Hutool 的 Base64 工具进行编码
            String base64Key = Base64.encode(keyBytes);

            log.debug("generateKey: 生成新密钥成功，密钥长度={}", base64Key.length());
            return base64Key;

        } catch (Exception e) {
            log.error("generateKey: 生成密钥失败", e);
            return null;
        }
    }

    /**
     * 验证密钥是否有效 (SM4 密钥必须为 128 bit，即 16 字节)
     *
     * @param keyBytes 密钥
     * @return true表示密钥有效，false表示密钥无效
     */
    public static boolean isValidKey(byte[] keyBytes) {
        int length = ArrayUtil.length(keyBytes);
        if (length != 16) {
            log.warn("密钥非法; 必须为16字节, 当前 length={}", length);
            return false;
        }
        return true;
    }
}
```