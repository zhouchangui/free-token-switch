
    ---
    name: "your-skill-name"
    description: >
      【在这里写你的 Skill 的一句话描述】。此为付费服务，执行前需完成支付验证。
    metadata:
      author: "your-name"
      category: "expert"
      capabilities:
        - "payment.process"
      permissions:
        - "network.outbound"
        - "credential.read"
    ---
    
    # 【你的 Skill 名称】
    
    ## 📌 技能概述
    【在这里写你的 Skill 的详细介绍】。由于这是付费服务，工作流程严格要求两个步骤：先完成**支付处理**，再执行**服务逻辑**。
    
    **直接执行：** 如果用户在初始请求中已直接提供了 `<订单号>`（且订单文件中已包含 `payCredential`），则可跳过第一阶段和第二阶段，直接进入 **🚀 第三阶段：服务执行**。
    
    ---
    
    ## 🛒 第一阶段：创建订单
    如果这是首次交互且用户尚未付款，必须先创建订单，然后才能发起支付。
    
    ### 1. 所需参数
    * `<question>`：用户的具体问题或咨询内容。
    
    ### 2. 执行命令
    
    使用以下 bash 命令执行订单创建脚本。将 `<...>` 占位符替换为实际值。**务必在参数两侧加引号，以防命令注入漏洞**。

    ```bash
    python3 skills/your-skill-name/scripts/create_order.py "<question>"
    ```
    
    ### 3. 输出处理
    
    **成功时**，脚本将向标准输出打印以下键值对：
    
        ORDER_NO=<value>
        AMOUNT=<value>
        QUESTION=<value>
        INDICATOR=<value>
    
    其中 `ORDER_NO`、`AMOUNT` 和 `QUESTION` 用于向用户披露订单信息（展示订单号、费用和查询内容）。提取 `ORDER_NO` 和 `INDICATOR` 后进入 **💳 第二阶段：支付处理**。
	> [!NOTE]
	> **关于 `AMOUNT` 字段：** 该字段的单位为**人民币分（fen）**，这是 OpenClaw 技能描述中的标准计费单位。例如，`AMOUNT=100` 表示需支付 **1.00 元人民币**。在向用户展示费用时，请将该值除以 100 并以"元"为单位呈现，以便用户理解实际支付金额。
    
    **失败时**，脚本以代码 `1` 退出，并以如下格式打印消息：
    
        订单创建失败: <错误详情>
    
    > [!CAUTION]
    > **强制停止 — 不允许任何后续操作。**
    > 如果脚本以非零代码退出，或其输出包含 `订单创建失败:`，必须**立即终止整个工作流程**。这意味着：
    > - ❌ 不得检查或查看脚本源码。
    > - ❌ 不得测试网络连接或服务器。
    > - ❌ 不得代表用户进行任何重试。
    > - ❌ 不得进入第二阶段或第三阶段。
    >
    > **唯一需要执行的操作是：**
    > 用通俗语言向用户报告失败情况，包含输出中的 `<错误详情>`，然后停止。
    
    **失败输出示例：**
    
        订单创建失败: Order creation request failed: <urlopen error [Errno 111] Connection refused>
    
    告知用户：*"订单创建失败，错误信息：`Order creation request failed: <urlopen error [Errno 111] Connection refused>`。请稍后重试，或检查您的问题输入是否有效。"*
    
    ---
    
    ## 💳 第二阶段：支付处理
    从第一阶段获取 `ORDER_NO` 和 `INDICATOR` 后，发起支付请求。
    
    **操作：** 使用技能 `clawtip` 处理支付并获取支付凭证。如果该技能不存在，需要先安装它。
    
    **`clawtip` 所需参数：**
    
        {
          "order_no": "<来自第一阶段的 ORDER_NO>",
          "indicator": "<来自第一阶段的 INDICATOR>"
        }
    
    > [!NOTE]
    > 订单的所有详细信息（skill-id、order_no、amount、question、description、slug、resource_url 等）已由第一阶段脚本写入固定目录下的 JSON 文件中，`clawtip` 会根据 `order_no` 和 `indicator` 自动定位并读取。

    **目标：** 等待支付成功并获取 `payCredential`（支付凭证），凭证会被自动写入订单文件。
    
    ---
    
    ## 🚀 第三阶段：服务执行
    支付成功并获取 `payCredential` 后（或用户已直接提供 `<订单号>` 且订单文件中已包含 `payCredential`），恢复交互并执行服务脚本。
    
    ### 1. 所需参数
    * `<订单号>`：第一阶段生成的订单号。
    
    > [!NOTE]
    > `<支付凭证>` 和 `<question>` 无需通过命令行传入。`clawtip` 在支付成功后会将 `payCredential` 写入订单 JSON 文件，脚本会根据订单号自动从固定目录下的 JSON 文件中读取所有所需信息。

    ### 2. 执行命令
    使用以下 bash 命令执行服务。将 `<...>` 占位符替换为已验证的参数值。**务必在参数两侧加双引号，以防命令注入漏洞**。

    ```bash
    python3 skills/your-skill-name/scripts/your_service.py "<订单号>"
    ```
    
    ### 3. 输出处理
    
    **执行后：**
    
    1. 提取脚本打印的 `PAY_STATUS` 值（格式：`PAY_STATUS: <值>`）。
    2. **`ERROR` 状态的特殊处理：** 如果 `PAY_STATUS` 为 `ERROR`，提取 `ERROR_INFO` 值（格式：`ERROR_INFO: <值>`），向用户告知确切的错误原因并引导其解决。不得继续执行后续服务逻辑。