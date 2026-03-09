import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Input, Select } from 'antd';
import type { Dataset, CreateDatasetDto } from '../types';
import { PARSER_OPTIONS, LANGUAGE_OPTIONS } from '../types';

interface CreateDatasetModalProps {
  open: boolean;
  editingDataset: Dataset | null;
  submitting: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  onSubmit: (values: CreateDatasetDto) => Promise<void>;
  onCancel: () => void;
}

const CreateDatasetModal: React.FC<CreateDatasetModalProps> = ({
  open,
  editingDataset,
  submitting,
  form,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={editingDataset ? t('datasets.editTitle') : t('datasets.createTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      width={520}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        preserve={false}
        initialValues={{
          language: 'English',
          parser_id: 'naive',
        }}
      >
        <Form.Item
          name="name"
          label={t('datasets.name')}
          rules={[{ required: true, message: t('datasets.nameRequired') }]}
        >
          <Input placeholder={t('datasets.namePlaceholder')} maxLength={128} />
        </Form.Item>

        <Form.Item name="description" label={t('datasets.description')}>
          <Input.TextArea
            rows={2}
            placeholder={t('datasets.descriptionPlaceholder')}
          />
        </Form.Item>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item name="language" label={t('datasets.language')}>
            <Select
              options={LANGUAGE_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
            />
          </Form.Item>

          <Form.Item name="parser_id" label={t('datasets.chunkMethod')}>
            <Select
              options={PARSER_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
            />
          </Form.Item>
        </div>

        <Form.Item name="embedding_model" label={t('datasets.embeddingModel')}>
          <Input placeholder={t('datasets.embeddingModelPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateDatasetModal;
