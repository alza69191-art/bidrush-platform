-- BidRush support center and safe account deletion
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL;
CREATE TABLE IF NOT EXISTS support_tickets (
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 subject VARCHAR(160) NOT NULL,
 category VARCHAR(50) NOT NULL DEFAULT 'general',
 status ENUM('open','waiting_user','waiting_support','resolved','closed') NOT NULL DEFAULT 'open',
 priority ENUM('normal','high','urgent') NOT NULL DEFAULT 'normal',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_support_status_time(status,updated_at),
 INDEX idx_support_user_time(user_id,updated_at),
 CONSTRAINT fk_support_ticket_user FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS support_messages (
 id CHAR(36) PRIMARY KEY,
 ticket_id CHAR(36) NOT NULL,
 sender_id CHAR(36) NULL,
 sender_type ENUM('user','admin','system') NOT NULL,
 body TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_support_messages_ticket_time(ticket_id,created_at),
 CONSTRAINT fk_support_message_ticket FOREIGN KEY(ticket_id) REFERENCES support_tickets(id),
 CONSTRAINT fk_support_message_sender FOREIGN KEY(sender_id) REFERENCES users(id)
);