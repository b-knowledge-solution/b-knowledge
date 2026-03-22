"""Email sending tool for agent workflows.

Sends emails via SMTP. Requires SMTP server credentials (host, port,
username, password) provided via the credentials dict.
"""

import smtplib
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Any

from loguru import logger

from .base_tool import BaseTool


class EmailTool(BaseTool):
    """Email sending tool via SMTP.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "email"
    description = "Send email via SMTP"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Send an email via SMTP.

        Args:
            input_data: Must contain 'to_email' and optionally 'subject',
                'content', and 'cc_email' (comma-separated).
            config: Optional 'sender_name' (default 'B-Knowledge Agent').
            credentials: Must contain 'smtp_host', 'smtp_port', 'username', 'password'.

        Returns:
            Dict with 'result' containing success status and message.
        """
        if not credentials:
            return {"error": "SMTP credentials not configured"}

        # Validate required SMTP credentials
        smtp_host = credentials.get("smtp_host", "")
        smtp_port = int(credentials.get("smtp_port", "587"))
        username = credentials.get("username", "")
        password = credentials.get("password", "")

        if not smtp_host or not username or not password:
            return {"error": "Incomplete SMTP credentials (need smtp_host, username, password)"}

        # Extract email fields from input
        to_email = input_data.get("to_email", "")
        if not to_email:
            return {"error": "No recipient email address provided (to_email)"}

        subject = input_data.get("subject", "No Subject")
        content = input_data.get("content", input_data.get("output", ""))
        cc_email = input_data.get("cc_email", "")
        sender_name = config.get("sender_name", "B-Knowledge Agent")

        try:
            # Build the email message with proper encoding
            msg = MIMEMultipart("alternative")
            msg["From"] = formataddr((str(Header(sender_name, "utf-8")), username))
            msg["To"] = to_email
            if cc_email:
                msg["Cc"] = cc_email
            msg["Subject"] = Header(subject, "utf-8").encode()

            # Attach content as HTML to support rich formatting
            msg.attach(MIMEText(content, "html", "utf-8"))

            # Connect to SMTP server with STARTTLS encryption
            logger.info(f"Connecting to SMTP server {smtp_host}:{smtp_port}")
            context = smtplib.ssl.create_default_context()
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(username, password)

                # Build full recipient list including CC
                recipients = [to_email]
                if cc_email:
                    recipients.extend(cc_email.split(","))

                server.send_message(msg, username, recipients)

            logger.info(f"Email sent successfully to {to_email}")
            return {"result": {"success": True, "message": f"Email sent to {to_email}"}}

        except smtplib.SMTPAuthenticationError:
            logger.error("SMTP authentication failed")
            return {"error": "SMTP authentication failed. Check username and password."}
        except smtplib.SMTPConnectError:
            logger.error(f"Failed to connect to SMTP server {smtp_host}:{smtp_port}")
            return {"error": f"Failed to connect to SMTP server {smtp_host}:{smtp_port}"}
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {e}")
            return {"error": f"SMTP error: {str(e)}"}
        except Exception as e:
            logger.error(f"Email sending failed: {e}")
            return {"error": f"Email sending failed: {str(e)}"}
