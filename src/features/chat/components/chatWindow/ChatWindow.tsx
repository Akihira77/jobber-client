import { filter, find } from "lodash";
import {
  ChangeEvent,
  FC,
  FormEvent,
  lazy,
  LazyExoticComponent,
  ReactElement,
  Suspense,
  useEffect,
  useRef,
  useState
} from "react";
import { FaPaperclip, FaPaperPlane } from "react-icons/fa";
import { useParams } from "react-router-dom";
import { IBuyerDocument } from "src/features/buyer/interfaces/buyer.interface";
import { useGetBuyerByUsernameQuery } from "src/features/buyer/service/buyer.service";
import { useGetGigByIdQuery } from "src/features/gigs/service/gig.service";
import Button from "src/shared/button/Button";
import { updateNotification } from "src/shared/header/reducer/notification.reducer";
import TextInput from "src/shared/input/TextInput";
import {
  checkFile,
  fileType,
  readAsBase64
} from "src/shared/utils/image-util.service";
import { TimeAgo } from "src/shared/utils/timeago.util";
import {
  firstLetterUppercase,
  showErrorToast
} from "src/shared/utils/util.service";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { IReduxState } from "src/store/store.interface";
import { v4 as uuidv4 } from "uuid";

import useChatScrollToBottom from "../../hook/useChatScrollToBottom";
import {
  IChatMessageProps,
  IChatWindowProps,
  IFilePreviewProps,
  IMessageDocument
} from "../../service/interfaces/chat.interface";
import { useSaveChatMessageMutation } from "../../service/chat.service";
import { IModalProps } from "src/shared/modal/interfaces/modal.interface";
import { socket, socketService } from "src/sockets/socket.service";

const ChatFile: LazyExoticComponent<FC<IChatMessageProps>> = lazy(
  () => import("./ChatFile")
);
const ChatImagePreview: LazyExoticComponent<FC<IFilePreviewProps>> = lazy(
  () => import("./ChatImagePreview")
);
const ChatOffer: LazyExoticComponent<FC<IChatMessageProps>> = lazy(
  () => import("./ChatOffer")
);
const OfferModal: LazyExoticComponent<FC<IModalProps>> = lazy(
  () => import("src/shared/modal/OfferModal")
);

const MESSAGE_STATUS = {
  EMPTY: "",
  IS_LOADING: false,
  LOADING: true
};
const NOT_EXISTING_ID = "649db27404c0c7b7d4b112ec";

const ChatWindow: FC<IChatWindowProps> = ({
  chatMessages,
  isLoading,
  setSkip
}): ReactElement => {
  const seller = useAppSelector((state: IReduxState) => state.seller);
  const authUser = useAppSelector((state: IReduxState) => state.authUser);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useChatScrollToBottom([]);
  const { username } = useParams<string>();
  const receiverUsername = useRef<string>(MESSAGE_STATUS.EMPTY);
  const receiverRef = useRef<IBuyerDocument>();
  const singleMessageRef = useRef<IMessageDocument>();
  const [showImagePreview, setShowImagePreview] = useState<boolean>(
    MESSAGE_STATUS.IS_LOADING
  );
  const [displayCustomOffer, setDisplayCustomOffer] = useState<boolean>(
    MESSAGE_STATUS.IS_LOADING
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(
    MESSAGE_STATUS.IS_LOADING
  );
  const [message, setMessage] = useState<string>(MESSAGE_STATUS.EMPTY);
  const dispatch = useAppDispatch();
  const { data: buyerData, isSuccess: isBuyerSuccess } =
    useGetBuyerByUsernameQuery(firstLetterUppercase(username!));
  const { data } = useGetGigByIdQuery(
    singleMessageRef.current
      ? `${singleMessageRef.current?.gigId}`
      : NOT_EXISTING_ID
  );
  const [saveChatMessage] = useSaveChatMessageMutation();

  if (isBuyerSuccess) {
    receiverRef.current = buyerData.buyer;
  }

  if (chatMessages.length) {
    singleMessageRef.current = chatMessages[chatMessages.length - 1];
  }

  const handleFileChange = (event: ChangeEvent): void => {
    const target: HTMLInputElement = event.target as HTMLInputElement;
    if (target.files) {
      const file: File = target.files[0];
      if (!checkFile(file)) {
        setSelectedFile(file);
        setShowImagePreview(MESSAGE_STATUS.LOADING);
      }
    }
  };

  const setChatMessage = (event: ChangeEvent): void => {
    setMessage((event.target as HTMLInputElement).value);
  };

  const sendMessage = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (setSkip) {
      setSkip(true);
    }

    if (!message && !selectedFile) {
      return;
    }
    try {
      setIsUploadingFile(MESSAGE_STATUS.LOADING);

      const messageBody: IMessageDocument = {
        conversationId: singleMessageRef?.current?.conversationId,
        hasConversationId: true,
        body: message,
        gigId: singleMessageRef?.current?.gigId,
        sellerId: singleMessageRef?.current?.sellerId,
        buyerId: singleMessageRef?.current?.buyerId,
        senderUsername: `${authUser?.username}`,
        senderPicture: `${authUser?.profilePicture}`,
        receiverUsername: receiverRef?.current?.username,
        receiverPicture: receiverRef?.current?.profilePicture,
        isRead: false,
        hasOffer: false
      };

      if (selectedFile) {
        const dataImage: string | ArrayBuffer | null =
          await readAsBase64(selectedFile);
        messageBody.file = dataImage as string;
        messageBody.body = messageBody.body ? messageBody.body : "1 file sent";
        messageBody.fileType = fileType(selectedFile);
        messageBody.fileName = selectedFile.name;
        messageBody.fileSize = selectedFile.size.toString();
      }

      await saveChatMessage(messageBody).unwrap();
      setSelectedFile(null);
      setShowImagePreview(MESSAGE_STATUS.IS_LOADING);
      setMessage(MESSAGE_STATUS.EMPTY);
      setIsUploadingFile(MESSAGE_STATUS.IS_LOADING);
    } catch (error) {
      setMessage(MESSAGE_STATUS.EMPTY);
      setIsUploadingFile(MESSAGE_STATUS.IS_LOADING);
      showErrorToast("Error sending message.");
    }
  };

  useEffect(() => {
    const list: IMessageDocument[] = filter(
      chatMessages,
      (item: IMessageDocument) =>
        !item.isRead && item.receiverUsername === username
    );
    dispatch(updateNotification({ hasUnreadMessage: list.length > 0 }));
  }, [chatMessages, dispatch, username]);

  useEffect(() => {
    // socketService.setupSocketConnection();
    socket.emit("getLoggedInUsers", "");
    socket.on("online", (data: string[]) => {
      receiverUsername.current = find(
        data,
        (name: string) => name === receiverRef?.current?.username
      ) as string;
    });
  }, []);

  return (
    <Suspense>
      {!isLoading && displayCustomOffer && (
        <OfferModal
          header="Create Custom Offer"
          gigTitle={data?.gig?.title ?? ""}
          singleMessage={singleMessageRef?.current}
          receiver={receiverRef?.current}
          authUser={authUser}
          cancelBtnHandler={() =>
            setDisplayCustomOffer(MESSAGE_STATUS.IS_LOADING)
          }
        />
      )}
      {!isLoading && (
        <div className="flex min-h-full w-full flex-col">
          <div className="border-grey flex w-full flex-col border-b px-5 py-0.5 ">
            {receiverUsername.current === receiverRef?.current?.username ? (
              <>
                <div className="flex items-center gap-2 py-2.5 text-lg font-semibold">
                  <img
                    className="h-10 w-10 object-cover rounded-full"
                    src={receiverRef.current?.profilePicture}
                    alt="Receiver Profile"
                  />
                  <div>
                    <h2> {firstLetterUppercase(username!)}</h2>
                    <div className="flex gap-1 pb-1 text-xs font-normal">
                      Online
                      <span className="flex h-2.5 w-2.5 self-center rounded-full border-2 border-white bg-green-400"></span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 py-2.5 text-lg font-semibold">
                  <img
                    className="h-10 w-10 object-cover rounded-full"
                    src={receiverRef.current?.profilePicture}
                    alt="Receiver Profile"
                  />
                  <h2> {firstLetterUppercase(username!)}</h2>
                </div>
                <span className="py-2.5s text-xs font-normal"></span>
              </>
            )}
          </div>
          <div className="max-h-[400px] min-w-full max-w-[700px]">
            <div
              className="flex h-full grow flex-col overflow-scroll min-w-full"
              ref={scrollRef}
            >
              {chatMessages.map((message: IMessageDocument) => (
                <div key={uuidv4()} className={` hover:bg-[#f5fbff]`}>
                  <div className="flex w-full cursor-pointer items-center space-x-4 px-5 py-2">
                    <div className="w-full text-sm dark:text-white">
                      <div className="flex gap-x-2 pb-1 font-bold text-[#777d74]">
                        <span>
                          {message.senderUsername === authUser.username
                            ? "You"
                            : message.senderUsername}
                        </span>
                        <span className="mt-1 self-center text-xs font-normal">
                          {TimeAgo.transform(message.createdAt!.toString())}
                        </span>
                      </div>
                      <div className="flex flex-col text-[#777d74]">
                        <span>{message.body}</span>
                        {message.hasOffer && (
                          <ChatOffer
                            message={message}
                            seller={seller}
                            gig={data?.gig}
                          />
                        )}
                        {message.file && <ChatFile message={message} />}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10 flex flex-col">
            {showImagePreview && (
              <ChatImagePreview
                image={URL.createObjectURL(selectedFile as File)}
                file={selectedFile as File}
                isLoading={isUploadingFile}
                message={message}
                handleChange={setChatMessage}
                onSubmit={sendMessage}
                onRemoveImage={() => {
                  setSelectedFile(null);
                  setShowImagePreview(MESSAGE_STATUS.IS_LOADING);
                }}
              />
            )}
            {!showImagePreview && (
              <div className="bottom-0 left-0 right-0 z-0 h-28 px-4 ">
                <form onSubmit={sendMessage} className="mb-1 w-full">
                  <TextInput
                    type="text"
                    name="message"
                    value={message}
                    className="border-grey mb-1 w-full rounded border p-3.5 text-sm font-normal text-gray-600 focus:outline-none"
                    placeholder="Enter your message..."
                    onChange={(event: ChangeEvent) =>
                      setMessage((event.target as HTMLInputElement).value)
                    }
                  />
                </form>
                <div className="flex cursor-pointer flex-row justify-between">
                  <div className="flex gap-4">
                    <FaPaperclip
                      className="mt-1 self-center"
                      onClick={() => fileRef?.current?.click()}
                    />
                    {singleMessageRef?.current?.sellerId === seller?._id && (
                      <Button
                        className="rounded bg-sky-500 px-6 py-3 text-center text-sm font-bold text-white hover:bg-sky-400 focus:outline-none md:px-4 md:py-2 md:text-base"
                        disabled={false}
                        label="Add Offer"
                        onClick={() =>
                          setDisplayCustomOffer(MESSAGE_STATUS.LOADING)
                        }
                      />
                    )}
                    <TextInput
                      name="chatFile"
                      ref={fileRef}
                      type="file"
                      style={{ display: "none" }}
                      onClick={() => {
                        if (fileRef.current) {
                          fileRef.current.value = "";
                        }
                      }}
                      onChange={handleFileChange}
                    />
                  </div>
                  <div className="flex gap-4">
                    <Button
                      className="rounded bg-sky-500 px-6 py-3 text-center text-sm font-bold text-white hover:bg-sky-400 focus:outline-none md:px-4 md:py-2 md:text-base"
                      disabled={false}
                      label={<FaPaperPlane className="self-center" />}
                      onClick={sendMessage}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Suspense>
  );
};

export default ChatWindow;
