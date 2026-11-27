/**
 * App icon set: Solar "Bold" (filled) icons by 480 Design, CC BY 4.0.
 *
 * Every screen imports icons from here, never from an icon package directly, so the
 * whole app can be restyled in this one file. Names keep the previous Phosphor names
 * so call sites stay unchanged; the right-hand side picks the Solar glyph.
 *
 * `weight` is kept for compatibility. Solar Bold has one weight, so 'fill' and 'bold'
 * render the same; 'regular' (an "off" toggle state) renders muted at 55% opacity.
 */
import type { Icon as SolarIcon } from '@solar-icons/react-native/lib/types';
import { AddIcon } from '@solar-icons/react-native/bold/add';
import { AltArrowDownIcon } from '@solar-icons/react-native/bold/alt-arrow-down';
import { AltArrowLeftIcon } from '@solar-icons/react-native/bold/alt-arrow-left';
import { AltArrowRightIcon } from '@solar-icons/react-native/bold/alt-arrow-right';
import { AltArrowUpIcon } from '@solar-icons/react-native/bold/alt-arrow-up';
import { ArrowDownIcon } from '@solar-icons/react-native/bold/arrow-down';
import { ArrowRightIcon } from '@solar-icons/react-native/bold/arrow-right';
import { ArrowUpIcon } from '@solar-icons/react-native/bold/arrow-up';
import { BatteryChargeIcon } from '@solar-icons/react-native/bold/battery-charge';
import { BellOffIcon } from '@solar-icons/react-native/bold/bell-off';
import { BellRingIcon } from '@solar-icons/react-native/bold/bell-ring';
import { BoltIcon } from '@solar-icons/react-native/bold/bolt';
import { Book2Icon } from '@solar-icons/react-native/bold/book-2';
import { BookmarkIcon } from '@solar-icons/react-native/bold/bookmark';
import { CalendarMarkIcon } from '@solar-icons/react-native/bold/calendar-mark';
import { CameraIcon } from '@solar-icons/react-native/bold/camera';
import { ChartIcon } from '@solar-icons/react-native/bold/chart';
import { ChatRoundDotsIcon } from '@solar-icons/react-native/bold/chat-round-dots';
import { ChatRoundLineIcon } from '@solar-icons/react-native/bold/chat-round-line';
import { CheckIcon } from '@solar-icons/react-native/bold/check';
import { CheckCircleIcon } from '@solar-icons/react-native/bold/check-circle';
import { ClockCircleIcon } from '@solar-icons/react-native/bold/clock-circle';
import { CloseIcon } from '@solar-icons/react-native/bold/close';
import { CloseCircleIcon } from '@solar-icons/react-native/bold/close-circle';
import { CompassIcon } from '@solar-icons/react-native/bold/compass';
import { ConfettiIcon } from '@solar-icons/react-native/bold/confetti';
import { ContrastIcon } from '@solar-icons/react-native/bold/contrast';
import { CopyIcon } from '@solar-icons/react-native/bold/copy';
import { CrownMinimalisticIcon } from '@solar-icons/react-native/bold/crown-minimalistic';
import { CursorClickIcon } from '@solar-icons/react-native/bold/cursor-click';
import { DangerCircleIcon } from '@solar-icons/react-native/bold/danger-circle';
import { DangerTriangleIcon } from '@solar-icons/react-native/bold/danger-triangle';
import { Dialog2Icon } from '@solar-icons/react-native/bold/dialog-2';
import { DocumentTextIcon } from '@solar-icons/react-native/bold/document-text';
import { DownloadMinimalisticIcon } from '@solar-icons/react-native/bold/download-minimalistic';
import { ExportIcon } from '@solar-icons/react-native/bold/export';
import { EyeIcon } from '@solar-icons/react-native/bold/eye';
import { EyeClosedIcon } from '@solar-icons/react-native/bold/eye-closed';
import { FileSendIcon } from '@solar-icons/react-native/bold/file-send';
import { FireIcon } from '@solar-icons/react-native/bold/fire';
import { FlagIcon } from '@solar-icons/react-native/bold/flag';
import { FlashlightIcon } from '@solar-icons/react-native/bold/flashlight';
import { ForbiddenCircleIcon } from '@solar-icons/react-native/bold/forbidden-circle';
import { GamepadMinimalisticIcon } from '@solar-icons/react-native/bold/gamepad-minimalistic';
import { GlobalIcon } from '@solar-icons/react-native/bold/global';
import { GraphDownIcon } from '@solar-icons/react-native/bold/graph-down';
import { GraphUpIcon } from '@solar-icons/react-native/bold/graph-up';
import { HeartIcon } from '@solar-icons/react-native/bold/heart';
import { HelpIcon } from '@solar-icons/react-native/bold/help';
import { HomeIcon } from '@solar-icons/react-native/bold/home';
import { Home2Icon } from '@solar-icons/react-native/bold/home-2';
import { HourglassIcon } from '@solar-icons/react-native/bold/hourglass';
import { InfoCircleIcon } from '@solar-icons/react-native/bold/info-circle';
import { KeyboardIcon } from '@solar-icons/react-native/bold/keyboard';
import { LayersIcon } from '@solar-icons/react-native/bold/layers';
import { LightbulbIcon } from '@solar-icons/react-native/bold/lightbulb';
import { LockIcon } from '@solar-icons/react-native/bold/lock';
import { LockKeyholeIcon } from '@solar-icons/react-native/bold/lock-keyhole';
import { LockKeyholeUnlockedIcon } from '@solar-icons/react-native/bold/lock-keyhole-unlocked';
import { Logout2Icon } from '@solar-icons/react-native/bold/logout-2';
import { MapIcon } from '@solar-icons/react-native/bold/map';
import { MapPointWaveIcon } from '@solar-icons/react-native/bold/map-point-wave';
import { MaximizeIcon } from '@solar-icons/react-native/bold/maximize';
import { MenuDotsIcon } from '@solar-icons/react-native/bold/menu-dots';
import { MinusIcon } from '@solar-icons/react-native/bold/minus';
import { MonitorIcon } from '@solar-icons/react-native/bold/monitor';
import { MoonIcon } from '@solar-icons/react-native/bold/moon';
import { MoonStarsIcon } from '@solar-icons/react-native/bold/moon-stars';
import { NotebookBookmarkIcon } from '@solar-icons/react-native/bold/notebook-bookmark';
import { PauseIcon } from '@solar-icons/react-native/bold/pause';
import { PhoneIcon } from '@solar-icons/react-native/bold/phone';
import { Plane2Icon } from '@solar-icons/react-native/bold/plane-2';
import { PlayIcon } from '@solar-icons/react-native/bold/play';
import { PresentationGraphIcon } from '@solar-icons/react-native/bold/presentation-graph';
import { QrCodeIcon } from '@solar-icons/react-native/bold/qr-code';
import { QuestionCircleIcon } from '@solar-icons/react-native/bold/question-circle';
import { RefreshIcon } from '@solar-icons/react-native/bold/refresh';
import { ScannerIcon } from '@solar-icons/react-native/bold/scanner';
import { SettingsIcon } from '@solar-icons/react-native/bold/settings';
import { ShareIcon } from '@solar-icons/react-native/bold/share';
import { ShieldCheckIcon } from '@solar-icons/react-native/bold/shield-check';
import { ShieldWarningIcon } from '@solar-icons/react-native/bold/shield-warning';
import { SmartphoneIcon } from '@solar-icons/react-native/bold/smartphone';
import { SmileCircleIcon } from '@solar-icons/react-native/bold/smile-circle';
import { SproutIcon } from '@solar-icons/react-native/bold/sprout';
import { SquareAcademicCapIcon } from '@solar-icons/react-native/bold/square-academic-cap';
import { SquareAcademicCap2Icon } from '@solar-icons/react-native/bold/square-academic-cap-2';
import { SquareTopUpIcon } from '@solar-icons/react-native/bold/square-top-up';
import { StarsIcon } from '@solar-icons/react-native/bold/stars';
import { StopwatchIcon } from '@solar-icons/react-native/bold/stopwatch';
import { TargetIcon } from '@solar-icons/react-native/bold/target';
import { ToolboxIcon } from '@solar-icons/react-native/bold/toolbox';
import { TranslateIcon } from '@solar-icons/react-native/bold/translate';
import { TrashBinTrashIcon } from '@solar-icons/react-native/bold/trash-bin-trash';
import { UserCircleIcon } from '@solar-icons/react-native/bold/user-circle';
import { UserMinusRoundedIcon } from '@solar-icons/react-native/bold/user-minus-rounded';
import { UserPlusRoundedIcon } from '@solar-icons/react-native/bold/user-plus-rounded';
import { UsersGroupRoundedIcon } from '@solar-icons/react-native/bold/users-group-rounded';
import { VerifiedCheckIcon } from '@solar-icons/react-native/bold/verified-check';
import { WaterIcon } from '@solar-icons/react-native/bold/water';
import { WiFiIcon } from '@solar-icons/react-native/bold/wi-fi';
import { WiFiOffIcon } from '@solar-icons/react-native/bold/wi-fi-off';
import { WidgetIcon } from '@solar-icons/react-native/bold/widget';
import { WindIcon } from '@solar-icons/react-native/bold/wind';
import type { StyleProp, ViewStyle } from 'react-native';

export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

export type IconProps = {
  size?: number;
  color?: string;
  weight?: IconWeight;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Accessibility label; omit for decorative icons. */
  alt?: string;
};

export type AppIcon = React.ComponentType<IconProps>;

const MUTED_WEIGHTS: ReadonlySet<IconWeight> = new Set(['thin', 'light', 'regular']);

function make(Glyph: SolarIcon, name: string): AppIcon {
  function Icon({ size = 24, color = '#2B2D31', weight = 'fill', style, testID, alt }: IconProps) {
    return (
      <Glyph
        size={size}
        color={color}
        opacity={MUTED_WEIGHTS.has(weight) ? 0.55 : 1}
        style={style}
        testID={testID}
        alt={alt}
      />
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const AppWindow = make(WidgetIcon, 'AppWindow');
export const ArrowDown = make(ArrowDownIcon, 'ArrowDown');
export const ArrowRight = make(ArrowRightIcon, 'ArrowRight');
export const ArrowUp = make(ArrowUpIcon, 'ArrowUp');
export const ArrowsOutSimple = make(MaximizeIcon, 'ArrowsOutSimple');
export const BatteryCharging = make(BatteryChargeIcon, 'BatteryCharging');
export const BellRinging = make(BellRingIcon, 'BellRinging');
export const BellSlash = make(BellOffIcon, 'BellSlash');
export const BookOpen = make(Book2Icon, 'BookOpen');
export const BookOpenText = make(NotebookBookmarkIcon, 'BookOpenText');
export const CalendarCheck = make(CalendarMarkIcon, 'CalendarCheck');
export const Camera = make(CameraIcon, 'Camera');
export const CaretDown = make(AltArrowDownIcon, 'CaretDown');
export const CaretLeft = make(AltArrowLeftIcon, 'CaretLeft');
export const CaretRight = make(AltArrowRightIcon, 'CaretRight');
export const CaretUp = make(AltArrowUpIcon, 'CaretUp');
export const ChalkboardTeacher = make(PresentationGraphIcon, 'ChalkboardTeacher');
export const ChartBar = make(ChartIcon, 'ChartBar');
export const ChatCircleDots = make(ChatRoundDotsIcon, 'ChatCircleDots');
export const ChatTeardropText = make(ChatRoundLineIcon, 'ChatTeardropText');
export const ChatsCircle = make(Dialog2Icon, 'ChatsCircle');
export const Check = make(CheckIcon, 'Check');
export const CheckCircle = make(CheckCircleIcon, 'CheckCircle');
export const CircleHalf = make(ContrastIcon, 'CircleHalf');
export const Clock = make(ClockCircleIcon, 'Clock');
export const Compass = make(CompassIcon, 'Compass');
export const Copy = make(CopyIcon, 'Copy');
export const CopySimple = make(CopyIcon, 'CopySimple');
export const CrownSimple = make(CrownMinimalisticIcon, 'CrownSimple');
export const DeviceMobile = make(SmartphoneIcon, 'DeviceMobile');
export const Export = make(ExportIcon, 'Export');
export const Eye = make(EyeIcon, 'Eye');
export const EyeSlash = make(EyeClosedIcon, 'EyeSlash');
export const FileArrowUp = make(FileSendIcon, 'FileArrowUp');
export const FileText = make(DocumentTextIcon, 'FileText');
export const Flame = make(FireIcon, 'Flame');
export const Flashlight = make(FlashlightIcon, 'Flashlight');
export const GameController = make(GamepadMinimalisticIcon, 'GameController');
export const GearSix = make(SettingsIcon, 'GearSix');
export const GraduationCap = make(SquareAcademicCap2Icon, 'GraduationCap');
export const Heart = make(HeartIcon, 'Heart');
export const HourglassMedium = make(HourglassIcon, 'HourglassMedium');
export const House = make(HomeIcon, 'House');
export const HouseLine = make(Home2Icon, 'HouseLine');
export const Info = make(InfoCircleIcon, 'Info');
export const Keyboard = make(KeyboardIcon, 'Keyboard');
export const Lifebuoy = make(HelpIcon, 'Lifebuoy');
export const Lightbulb = make(LightbulbIcon, 'Lightbulb');
export const Lighthouse = make(MapPointWaveIcon, 'Lighthouse');
export const Lightning = make(BoltIcon, 'Lightning');
export const LockKey = make(LockKeyholeIcon, 'LockKey');
export const Minus = make(MinusIcon, 'Minus');
export const MonitorPlay = make(MonitorIcon, 'MonitorPlay');
export const Moon = make(MoonIcon, 'Moon');
export const MoonStars = make(MoonStarsIcon, 'MoonStars');
export const Pause = make(PauseIcon, 'Pause');
export const Phone = make(PhoneIcon, 'Phone');
export const Plant = make(SproutIcon, 'Plant');
export const Play = make(PlayIcon, 'Play');
export const Plus = make(AddIcon, 'Plus');
export const QrCode = make(QrCodeIcon, 'QrCode');
export const Question = make(QuestionCircleIcon, 'Question');
export const Scan = make(ScannerIcon, 'Scan');
export const SealCheck = make(VerifiedCheckIcon, 'SealCheck');
export const ShareNetwork = make(ShareIcon, 'ShareNetwork');
export const ShieldCheck = make(ShieldCheckIcon, 'ShieldCheck');
export const SignOut = make(Logout2Icon, 'SignOut');
export const Sparkle = make(StarsIcon, 'Sparkle');
export const Stack = make(LayersIcon, 'Stack');
export const Target = make(TargetIcon, 'Target');
export const Timer = make(StopwatchIcon, 'Timer');
export const Translate = make(TranslateIcon, 'Translate');
export const Trash = make(TrashBinTrashIcon, 'Trash');
export const TrendDown = make(GraphDownIcon, 'TrendDown');
export const TrendUp = make(GraphUpIcon, 'TrendUp');
export const UserCircle = make(UserCircleIcon, 'UserCircle');
export const UserPlus = make(UserPlusRoundedIcon, 'UserPlus');
export const UsersThree = make(UsersGroupRoundedIcon, 'UsersThree');
export const Warning = make(DangerTriangleIcon, 'Warning');
export const WarningCircle = make(DangerCircleIcon, 'WarningCircle');
export const Waves = make(WaterIcon, 'Waves');
export const WifiHigh = make(WiFiIcon, 'WifiHigh');
export const WifiSlash = make(WiFiOffIcon, 'WifiSlash');
export const Wind = make(WindIcon, 'Wind');
export const XCircle = make(CloseCircleIcon, 'XCircle');
export const ArrowSquareOut = make(SquareTopUpIcon, 'ArrowSquareOut');
export const ArrowsClockwise = make(RefreshIcon, 'ArrowsClockwise');
export const BookmarkSimple = make(BookmarkIcon, 'BookmarkSimple');
export const Confetti = make(ConfettiIcon, 'Confetti');
export const DotsThree = make(MenuDotsIcon, 'DotsThree');
export const DownloadSimple = make(DownloadMinimalisticIcon, 'DownloadSimple');
export const Flag = make(FlagIcon, 'Flag');
export const Globe = make(GlobalIcon, 'Globe');
export const Hammer = make(ToolboxIcon, 'Hammer');
export const HandPointing = make(CursorClickIcon, 'HandPointing');
export const Island = make(MapIcon, 'Island');
export const LockOpen = make(LockKeyholeUnlockedIcon, 'LockOpen');
export const LockSimple = make(LockIcon, 'LockSimple');
export const Monitor = make(MonitorIcon, 'Monitor');
export const PaperPlaneTilt = make(Plane2Icon, 'PaperPlaneTilt');
export const Prohibit = make(ForbiddenCircleIcon, 'Prohibit');
export const ShieldWarning = make(ShieldWarningIcon, 'ShieldWarning');
export const Smiley = make(SmileCircleIcon, 'Smiley');
export const Student = make(SquareAcademicCapIcon, 'Student');
export const UserMinus = make(UserMinusRoundedIcon, 'UserMinus');
export const X = make(CloseIcon, 'X');

/** Every app icon by name, for the dev gallery. */
export const ALL_ICONS: Readonly<Record<string, AppIcon>> = {
  AppWindow,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowsOutSimple,
  BatteryCharging,
  BellRinging,
  BellSlash,
  BookOpen,
  BookOpenText,
  CalendarCheck,
  Camera,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ChalkboardTeacher,
  ChartBar,
  ChatCircleDots,
  ChatTeardropText,
  ChatsCircle,
  Check,
  CheckCircle,
  CircleHalf,
  Clock,
  Compass,
  Copy,
  CopySimple,
  CrownSimple,
  DeviceMobile,
  Export,
  Eye,
  EyeSlash,
  FileArrowUp,
  FileText,
  Flame,
  Flashlight,
  GameController,
  GearSix,
  GraduationCap,
  Heart,
  HourglassMedium,
  House,
  HouseLine,
  Info,
  Keyboard,
  Lifebuoy,
  Lightbulb,
  Lighthouse,
  Lightning,
  LockKey,
  Minus,
  MonitorPlay,
  Moon,
  MoonStars,
  Pause,
  Phone,
  Plant,
  Play,
  Plus,
  QrCode,
  Question,
  Scan,
  SealCheck,
  ShareNetwork,
  ShieldCheck,
  SignOut,
  Sparkle,
  Stack,
  Target,
  Timer,
  Translate,
  Trash,
  TrendDown,
  TrendUp,
  UserCircle,
  UserPlus,
  UsersThree,
  Warning,
  WarningCircle,
  Waves,
  WifiHigh,
  WifiSlash,
  Wind,
  XCircle,
  ArrowSquareOut,
  ArrowsClockwise,
  BookmarkSimple,
  Confetti,
  DotsThree,
  DownloadSimple,
  Flag,
  Globe,
  Hammer,
  HandPointing,
  Island,
  LockOpen,
  LockSimple,
  Monitor,
  PaperPlaneTilt,
  Prohibit,
  ShieldWarning,
  Smiley,
  Student,
  UserMinus,
  X,
};
