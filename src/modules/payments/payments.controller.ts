import { Request, Response } from 'express';
import { container } from 'tsyringe';
import { PaymentsService } from './payments.service';
import ResponseUtils from '../../core/utils/response.utils';
import { RequestWithUser } from '../../types/types';

export class PaymentsController {
  private paymentsService: PaymentsService;
  private responseUtils: ResponseUtils;

  constructor() {
    this.paymentsService = container.resolve(PaymentsService);
    this.responseUtils = container.resolve(ResponseUtils);
  }

  /**
   * Create a new checkout session
   */
  public createCheckout = async (req: RequestWithUser, res: Response): Promise<void> => {
    try {
      // Extract user ID from authenticated user
      const userId = req.user?.user_data.id;
      
      if (!userId) {
        this.responseUtils.sendUnauthorizedResponse(res, 'User authentication required');
        return;
      }

      const result = await this.paymentsService.createCheckout(req.body, userId);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error: any) {
      this.responseUtils.sendErrorResponse(res, error);
    }
  };

  /**
   * Handle Chargily webhook events
   */
 public handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const rawBody = (req as any).rawBody || Buffer.from('');

      const signature = req.header('signature');

      await this.paymentsService.handleWebhook(rawBody, signature);
      res.status(200).send('OK');
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      if (error.message === 'Invalid signature') {
        res.status(403).send('Forbidden');
      } else if (error.message === 'Missing signature or body' || error.message === 'Missing request body') {
        res.status(400).send('Bad Request');
      } else {
        res.status(500).send('Internal Server Error');
      }
    }
  }
}